/**
 * Grid Manager - Linux 実装
 * getDisplayInfo は Electron screen API で実データ返却
 * Grid 配置は wmctrl -e で実装 (X11)
 */

const { screen } = require('electron');
const { exec } = require('child_process');

function run(cmd, timeout = 15000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout, encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        resolve('');
        return;
      }
      resolve(stdout || '');
    });
  });
}

function commandExists(cmd) {
  return new Promise((resolve) => {
    exec(`which ${cmd}`, (error) => {
      resolve(!error);
    });
  });
}

function getDisplayInfo() {
  const displays = screen.getAllDisplays();
  return displays.map((d, i) => ({
    index: i + 1,
    frameX: d.bounds.x,
    frameY: d.bounds.y,
    frameW: d.bounds.width,
    frameH: d.bounds.height,
    asX: d.workArea.x,
    asY: d.workArea.y,
    visibleW: d.workArea.width,
    visibleH: d.workArea.height,
    isMain: d.bounds.x === 0 && d.bounds.y === 0,
  }));
}

/**
 * グリッド列数・行数を決定
 */
function calcGridDims(count, screenW, userCols = 0, userRows = 0) {
  let gridC;
  if (userCols > 0) {
    gridC = userCols;
  } else if (count <= 1) {
    gridC = 1;
  } else if (count <= 2) {
    gridC = 2;
  } else if (count <= 6) {
    gridC = 3;
  } else if (count <= 12) {
    gridC = 4;
  } else if (count <= 20) {
    gridC = 5;
  } else {
    gridC = 6;
  }
  if (screenW > 3000 && gridC < 5) gridC = 5;
  if (screenW > 2560 && gridC < 4) gridC = 4;
  if (screenW > 1920 && gridC < 3) gridC = 3;

  const gridR = userRows > 0 ? userRows : Math.ceil(count / gridC);
  return { gridC, gridR };
}

/**
 * wmctrl でウィンドウリストを取得し、プロセス名でフィルタ
 * @returns {Promise<Array<{wid: string, pid: string, title: string}>>}
 */
async function getWmctrlWindows(processNames) {
  const stdout = await run('wmctrl -l -p');
  if (!stdout.trim()) return [];

  const windows = [];
  for (const line of stdout.trim().split('\n')) {
    const match = line.match(/^(0x[\da-f]+)\s+(\d+)\s+(\d+)\s+\S+\s+(.*)/i);
    if (!match) continue;

    const wid = match[1];
    const pid = match[3];
    const title = match[4] || '';

    // PID → プロセス名
    const procName = (await run(`ps -p ${pid} -o comm= 2>/dev/null`)).trim();
    if (!procName) continue;

    if (processNames.some(p => procName.startsWith(p))) {
      windows.push({ wid, pid, title });
    }
  }

  return windows;
}

/**
 * wmctrl -e でウィンドウ位置・サイズを設定
 * gravity=0 (default), x, y, width, height
 */
async function arrangeWindows(windows, displays, options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0 } = options;

  if (windows.length === 0) return 0;

  let arranged = 0;

  if (displayIndex > 0 && displayIndex <= displays.length) {
    // 指定ディスプレイに全ウィンドウを配置
    const d = displays[displayIndex - 1];
    const { gridC, gridR } = calcGridDims(windows.length, d.visibleW, cols, rows);

    for (let i = 0; i < windows.length; i++) {
      const gC = i % gridC;
      const gR = Math.floor(i / gridC);
      const x1 = d.asX + Math.floor(d.visibleW * gC / gridC);
      const x2 = d.asX + Math.floor(d.visibleW * (gC + 1) / gridC);
      const y1 = d.asY + Math.floor(d.visibleH * gR / gridR);
      const y2 = d.asY + Math.floor(d.visibleH * (gR + 1) / gridR);
      const w = x2 - x1;
      const h = y2 - y1;

      // まず最大化を解除
      await run(`wmctrl -i -r ${windows[i].wid} -b remove,maximized_vert,maximized_horz`);
      await run(`wmctrl -i -r ${windows[i].wid} -e 0,${x1},${y1},${w},${h}`);
      arranged++;
    }
  } else {
    // 自動モード: 各ディスプレイ上のウィンドウを個別に配置
    // まず各ウィンドウの位置を取得して所属ディスプレイを判定
    const windowPositions = [];
    for (const win of windows) {
      const geom = await run(`xdotool getwindowgeometry --shell ${win.wid} 2>/dev/null`);
      const xMatch = geom.match(/X=(\d+)/);
      const yMatch = geom.match(/Y=(\d+)/);
      const wMatch = geom.match(/WIDTH=(\d+)/);
      const hMatch = geom.match(/HEIGHT=(\d+)/);
      windowPositions.push({
        ...win,
        cx: (parseInt(xMatch?.[1] || '0') + parseInt(wMatch?.[1] || '100') / 2),
        cy: (parseInt(yMatch?.[1] || '0') + parseInt(hMatch?.[1] || '100') / 2),
      });
    }

    for (const d of displays) {
      const displayWindows = windowPositions.filter(w =>
        w.cx >= d.asX && w.cx < d.asX + d.visibleW &&
        w.cy >= d.asY && w.cy < d.asY + d.visibleH
      );

      if (displayWindows.length === 0) continue;

      const { gridC, gridR } = calcGridDims(displayWindows.length, d.visibleW, cols, rows);

      for (let j = 0; j < displayWindows.length; j++) {
        const gC = j % gridC;
        const gR = Math.floor(j / gridC);
        const x1 = d.asX + Math.floor(d.visibleW * gC / gridC);
        const x2 = d.asX + Math.floor(d.visibleW * (gC + 1) / gridC);
        const y1 = d.asY + Math.floor(d.visibleH * gR / gridR);
        const y2 = d.asY + Math.floor(d.visibleH * (gR + 1) / gridR);
        const w = x2 - x1;
        const h = y2 - y1;

        await run(`wmctrl -i -r ${displayWindows[j].wid} -b remove,maximized_vert,maximized_horz`);
        await run(`wmctrl -i -r ${displayWindows[j].wid} -e 0,${x1},${y1},${w},${h}`);
        arranged++;
      }
    }
  }

  return arranged;
}

async function arrangeTerminalGrid(options = {}) {
  try {
    const hasWmctrl = await commandExists('wmctrl');
    if (!hasWmctrl) {
      return { success: false, error: 'wmctrl not found', arranged: 0 };
    }

    const terminalNames = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'kitty', 'alacritty', 'xterm'];
    const windows = await getWmctrlWindows(terminalNames);
    const displays = getDisplayInfo();
    const arranged = await arrangeWindows(windows, displays, options);
    return { success: true, arranged };
  } catch (error) {
    console.error('arrangeTerminalGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

async function arrangeFinderGrid(options = {}) {
  try {
    const hasWmctrl = await commandExists('wmctrl');
    if (!hasWmctrl) {
      return { success: false, error: 'wmctrl not found', arranged: 0 };
    }

    const fileManagerNames = ['nautilus', 'dolphin', 'thunar', 'pcmanfm', 'nemo', 'caja'];
    const windows = await getWmctrlWindows(fileManagerNames);
    const displays = getDisplayInfo();
    const arranged = await arrangeWindows(windows, displays, options);
    return { success: true, arranged };
  } catch (error) {
    console.error('arrangeFinderGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

async function arrangeGenericGrid(appName, options = {}) {
  try {
    const hasWmctrl = await commandExists('wmctrl');
    if (!hasWmctrl) {
      return { success: false, error: 'wmctrl not found', arranged: 0 };
    }

    const windows = await getWmctrlWindows([appName]);
    const displays = getDisplayInfo();
    const arranged = await arrangeWindows(windows, displays, options);
    return { success: true, arranged };
  } catch (error) {
    console.error('arrangeGenericGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

module.exports = {
  getDisplayInfo,
  arrangeTerminalGrid,
  arrangeFinderGrid,
  arrangeGenericGrid,
};
