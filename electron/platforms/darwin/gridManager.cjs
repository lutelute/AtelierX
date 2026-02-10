/**
 * Grid Manager - ウィンドウグリッド配置モジュール
 *
 * 構成:
 *   buildSystemEventsGridScript(processName, options)
 *     → Terminal / 汎用アプリ共通（System Events の position/size で配置）
 *     → padding=-5 で文字セルスナップ補償、3段階パスでディスプレイ間移動対応
 *
 *   buildFinderGridScript(options)
 *     → Finder専用（ネイティブ bounds API、1パス、padding=0）
 *
 * ディスプレイ座標系:
 *   NSScreen (原点=メイン画面左下) → AppleScript座標 (原点=メイン画面左上) に変換
 *   外部ディスプレイで visibleFrame がメニューバーを含む場合 (vh==fh) は 25px 補正
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

// ----- AppleScript 実行 -----

function runAppleScript(script, timeout = 20000) {
  const tmpFile = path.join(os.tmpdir(), `applescript-${Date.now()}.scpt`);
  fs.writeFileSync(tmpFile, script, 'utf-8');
  return new Promise((resolve, reject) => {
    exec(`osascript "${tmpFile}"`, { encoding: 'utf-8', timeout }, (error, stdout) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

// ----- ディスプレイ情報取得 (JS側で使用) -----

const SCRIPT_GET_DISPLAYS = `
use framework "AppKit"
use scripting additions
set screenList to current application's NSScreen's screens()
set mainFrame to (item 1 of screenList)'s frame()
set mainH to (current application's NSHeight(mainFrame)) as integer
set output to ""
repeat with i from 1 to count of screenList
    set aScreen to item i of screenList
    set frm to aScreen's frame()
    set vf to aScreen's visibleFrame()
    set fx to (current application's NSMinX(frm)) as integer
    set fy to (current application's NSMinY(frm)) as integer
    set fw to (current application's NSWidth(frm)) as integer
    set fh to (current application's NSHeight(frm)) as integer
    set vw to (current application's NSWidth(vf)) as integer
    set vh to (current application's NSHeight(vf)) as integer
    set asX to fx
    set asY to mainH - (fy + fh)
    set output to output & i & "|" & fx & "|" & fy & "|" & fw & "|" & fh & "|" & asX & "|" & asY & "|" & vw & "|" & vh & linefeed
end repeat
return output
`;

async function getDisplayInfo() {
  try {
    const result = await runAppleScript(SCRIPT_GET_DISPLAYS);
    const displays = [];
    result.trim().split('\n').forEach(line => {
      const parts = line.split('|');
      if (parts.length >= 9) {
        displays.push({
          index: parseInt(parts[0]),
          frameX: parseInt(parts[1]),  frameY: parseInt(parts[2]),
          frameW: parseInt(parts[3]),  frameH: parseInt(parts[4]),
          asX:    parseInt(parts[5]),  asY:    parseInt(parts[6]),
          visibleW: parseInt(parts[7]), visibleH: parseInt(parts[8]),
          isMain: parts[1] === '0' && parts[2] === '0',
        });
      }
    });
    return displays;
  } catch (error) {
    console.error('getDisplayInfo error:', error);
    return [];
  }
}

// ----- AppleScript テンプレート部品 -----

/** ディスプレイ一覧を {x, y, w, h} のリストとして取得する AppleScript */
function asDisplayInfo() {
  return `
set screenList to current application's NSScreen's screens()
set screenCount to count of screenList
set mainH to (current application's NSHeight((item 1 of screenList)'s frame())) as integer
set displayInfo to {}
repeat with i from 1 to screenCount
    set aScreen to item i of screenList
    set vf to aScreen's visibleFrame()
    set frm to aScreen's frame()
    set vw to (current application's NSWidth(vf)) as integer
    set vh to (current application's NSHeight(vf)) as integer
    set fh to (current application's NSHeight(frm)) as integer
    set asX to (current application's NSMinX(vf)) as integer
    set asY to (mainH - (current application's NSMinY(vf)) as integer - vh)
    if vh = fh then
        set asY to asY + 25
        set vh to vh - 25
    end if
    set end of displayInfo to {x:asX, y:asY, w:vw, h:vh}
end repeat`;
}

/**
 * ウィンドウ数と画面幅からグリッド列数・行数を決定する AppleScript
 * - cntVar: ウィンドウ数の変数名 (例: "cnt")
 * - cols/rows: ユーザー指定値 (0=自動)
 */
function asGridCalc(cntVar, cols, rows) {
  const colsPart = cols > 0
    ? `set gridC to ${cols}`
    : `if ${cntVar} ≤ 1 then
    set gridC to 1
else if ${cntVar} ≤ 2 then
    set gridC to 2
else if ${cntVar} ≤ 3 then
    set gridC to 3
else if ${cntVar} ≤ 6 then
    set gridC to 3
else if ${cntVar} ≤ 8 then
    set gridC to 4
else if ${cntVar} ≤ 12 then
    set gridC to 4
else if ${cntVar} ≤ 20 then
    set gridC to 5
else
    set gridC to 6
end if
if screenW > 3000 and gridC < 5 then set gridC to 5
if screenW > 2560 and gridC < 4 then set gridC to 4
if screenW > 1920 and gridC < 3 then set gridC to 3`;

  const rowsPart = rows > 0
    ? `set gridR to ${rows}`
    : `set gridR to (${cntVar} + gridC - 1) div gridC`;

  return colsPart + '\n' + rowsPart;
}

// =========================================================
// System Events グリッド配置 (Terminal / 汎用アプリ共通)
// =========================================================
//
// Terminal.app の bounds API は外部ディスプレイで全ウィンドウが同一位置にスナップ
// するバグがあるため、System Events の position/size を使用する。
//
// Terminal はウィンドウサイズを文字セル境界(横7-8px, 縦14-16px)に丸めるため、
// padding=-5 で各ウィンドウを10px大きく要求し、スナップ後もオーバーラップを確保。
//
// 指定ディスプレイモードでは3段階パスで配置:
//   Pass 1: position のみ → ディスプレイ間移動を確実に
//   Pass 2: position + size → 正確な配置
//   Pass 3: position + size → 最終補正

function buildSystemEventsGridScript(processName, options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0, padding = -5 } = options;
  const escaped = processName.replace(/"/g, '\\"');

  return `use framework "AppKit"
use scripting additions
${asDisplayInfo()}

set pad to ${padding}
set totalArranged to 0
set targetDisplay to ${displayIndex}
if targetDisplay = 0 and screenCount = 1 then set targetDisplay to 1

tell application "${escaped}" to activate
delay 0.3

tell application "System Events"
    tell process "${escaped}"
        -- ウィンドウ収集 (小さすぎるUIパネル等を除外)
        set allWindows to every window
        set wl to {}
        repeat with wRef in allWindows
            try
                set s to size of wRef
                if (item 1 of s) > 50 and (item 2 of s) > 50 then
                    set end of wl to wRef
                end if
            end try
        end repeat
        set cnt to count of wl
        if cnt = 0 then return 0

        if targetDisplay > 0 and targetDisplay ≤ screenCount then
            -- ===== 指定ディスプレイモード: 全ウィンドウをターゲットに配置 =====
            set dInfo to item targetDisplay of displayInfo
            set screenX to x of dInfo
            set screenY to y of dInfo
            set screenW to w of dInfo
            set screenH to h of dInfo
            ${asGridCalc('cnt', cols, rows)}

            -- Pass 1: position のみ (ディスプレイ間移動)
            repeat with i from 1 to cnt
                try
                    set idx to i - 1
                    set x1 to screenX + (screenW * (idx mod gridC) div gridC) + pad
                    set y1 to screenY + (screenH * (idx div gridC) div gridR) + pad
                    set position of item i of wl to {x1, y1}
                end try
            end repeat
            delay 0.4

            -- Pass 2-3: position + size で正確に配置
            repeat with pass from 1 to 2
                repeat with i from 1 to cnt
                    try
                        set idx to i - 1
                        set gC to idx mod gridC
                        set gR to idx div gridC
                        set x1 to screenX + (screenW * gC div gridC) + pad
                        set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
                        set y1 to screenY + (screenH * gR div gridR) + pad
                        set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
                        set position of item i of wl to {x1, y1}
                        set size of item i of wl to {x2 - x1, y2 - y1}
                    end try
                end repeat
                if pass = 1 then delay 0.2
            end repeat
            set totalArranged to cnt
            -- 配置済みウィンドウを前面に
            repeat with i from 1 to cnt
                try
                    perform action "AXRaise" of item i of wl
                end try
            end repeat

        else
            -- ===== 自動モード: 各ディスプレイ内のウィンドウを個別に配置 =====
            repeat with dispIdx from 1 to screenCount
                set dInfo to item dispIdx of displayInfo
                set screenX to x of dInfo
                set screenY to y of dInfo
                set screenW to w of dInfo
                set screenH to h of dInfo

                -- このディスプレイに属するウィンドウを中心座標で判定
                set dw to {}
                repeat with i from 1 to cnt
                    try
                        set p to position of item i of wl
                        set s to size of item i of wl
                        set cx to (item 1 of p) + (item 1 of s) / 2
                        set cy to (item 2 of p) + (item 2 of s) / 2
                        if cx ≥ screenX and cx < (screenX + screenW) and cy ≥ screenY and cy < (screenY + screenH) then
                            set end of dw to (item i of wl)
                        end if
                    end try
                end repeat

                set dc to count of dw
                if dc > 0 then
                    ${asGridCalc('dc', cols, rows)}
                    repeat with pass from 1 to 2
                        repeat with j from 1 to dc
                            try
                                set idx to j - 1
                                set gC to idx mod gridC
                                set gR to idx div gridC
                                set x1 to screenX + (screenW * gC div gridC) + pad
                                set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
                                set y1 to screenY + (screenH * gR div gridR) + pad
                                set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
                                set position of (item j of dw) to {x1, y1}
                                set size of (item j of dw) to {x2 - x1, y2 - y1}
                            end try
                        end repeat
                        if pass = 1 then delay 0.15
                    end repeat
                    set totalArranged to totalArranged + dc
                end if
            end repeat
        end if
    end tell
end tell
return totalArranged`;
}

// =========================================================
// Finder グリッド配置 (ネイティブ bounds API)
// =========================================================
//
// Finder は bounds {left, top, right, bottom} を直接設定でき、
// 全ディスプレイで正確に動作するため、1パス・padding=0 で配置。

function buildFinderGridScript(options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0, padding = 0 } = options;

  return `use framework "AppKit"
use scripting additions
${asDisplayInfo()}

set pad to ${padding}
set totalArranged to 0
set targetDisplay to ${displayIndex}
if targetDisplay = 0 and screenCount = 1 then set targetDisplay to 1

tell application "Finder"
    activate
    set wl to every Finder window whose visible is true
    set cnt to count of wl
    if cnt = 0 then return 0

    if targetDisplay > 0 and targetDisplay ≤ screenCount then
        -- ===== 指定ディスプレイモード =====
        set dInfo to item targetDisplay of displayInfo
        set screenX to x of dInfo
        set screenY to y of dInfo
        set screenW to w of dInfo
        set screenH to h of dInfo
        ${asGridCalc('cnt', cols, rows)}

        repeat with i from 1 to cnt
            set idx to i - 1
            set gC to idx mod gridC
            set gR to idx div gridC
            set x1 to screenX + (screenW * gC div gridC) + pad
            set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
            set y1 to screenY + (screenH * gR div gridR) + pad
            set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
            set bounds of item i of wl to {x1, y1, x2, y2}
            set totalArranged to totalArranged + 1
        end repeat
    else
        -- ===== 自動モード =====
        repeat with dispIdx from 1 to screenCount
            set dInfo to item dispIdx of displayInfo
            set screenX to x of dInfo
            set screenY to y of dInfo
            set screenW to w of dInfo
            set screenH to h of dInfo

            set dw to {}
            repeat with i from 1 to cnt
                set b to bounds of item i of wl
                set cx to (item 1 of b) + ((item 3 of b) - (item 1 of b)) / 2
                set cy to (item 2 of b) + ((item 4 of b) - (item 2 of b)) / 2
                if cx ≥ screenX and cx < (screenX + screenW) and cy ≥ screenY and cy < (screenY + screenH) then
                    set end of dw to i
                end if
            end repeat

            set dc to count of dw
            if dc > 0 then
                ${asGridCalc('dc', cols, rows)}
                repeat with j from 1 to dc
                    set idx to j - 1
                    set gC to idx mod gridC
                    set gR to idx div gridC
                    set x1 to screenX + (screenW * gC div gridC) + pad
                    set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
                    set y1 to screenY + (screenH * gR div gridR) + pad
                    set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
                    set bounds of item (item j of dw) of wl to {x1, y1, x2, y2}
                    set totalArranged to totalArranged + 1
                end repeat
            end if
        end repeat
    end if
    return totalArranged
end tell`;
}

// =========================================================
// マルチアプリグリッド配置
// =========================================================
//
// 異なるアプリを組み合わせたグリッドに配置する。
// セルごとにアプリ名を指定し、同一アプリの複数セルはまとめて1つの
// AppleScriptで処理する。

/**
 * Finder用: 複数セルに1ウィンドウずつ配置する AppleScript を生成
 * @param {Array<{x:number, y:number, w:number, h:number}>} cellCoords - セル座標リスト
 */
function buildFinderMultiCellScript(cellCoords) {
  const boundsStatements = cellCoords.map((c, i) => {
    return `
            try
                set bounds of item ${i + 1} of wl to {${c.x}, ${c.y}, ${c.x + c.w}, ${c.y + c.h}}
            end try`;
  }).join('\n');

  return `tell application "Finder"
    activate
    delay 0.3
    set wl to every Finder window whose visible is true
    set cnt to count of wl
    set needed to ${cellCoords.length}
    if cnt < needed then
        repeat (needed - cnt) times
            make new Finder window
            delay 0.2
        end repeat
        set wl to every Finder window whose visible is true
    end if
${boundsStatements}
end tell
return ${cellCoords.length}`;
}

/**
 * System Events 汎用: 複数セルに1ウィンドウずつ配置する AppleScript を生成
 * @param {string} processName - プロセス名
 * @param {Array<{x:number, y:number, w:number, h:number}>} cellCoords - セル座標リスト
 * @param {number} padding - パディング (Terminal: -5, 汎用: 指定値)
 */
function buildSystemEventsMultiCellScript(processName, cellCoords, padding) {
  const escaped = processName.replace(/"/g, '\\"');
  const pad = padding;

  const posStatements = cellCoords.map((c, i) => {
    const x1 = c.x + pad;
    const y1 = c.y + pad;
    const w = c.w - pad * 2;
    const h = c.h - pad * 2;
    return `
                try
                    set position of item ${i + 1} of wl to {${x1}, ${y1}}
                    set size of item ${i + 1} of wl to {${w}, ${h}}
                end try`;
  }).join('\n');

  // 2パスで配置精度向上
  const pass2Statements = cellCoords.map((c, i) => {
    const x1 = c.x + pad;
    const y1 = c.y + pad;
    const w = c.w - pad * 2;
    const h = c.h - pad * 2;
    return `
                try
                    set position of item ${i + 1} of wl to {${x1}, ${y1}}
                    set size of item ${i + 1} of wl to {${w}, ${h}}
                end try`;
  }).join('\n');

  return `tell application "${escaped}" to activate
delay 0.3
tell application "System Events"
    tell process "${escaped}"
        set allWindows to every window
        set wl to {}
        repeat with wRef in allWindows
            try
                set s to size of wRef
                if (item 1 of s) > 50 and (item 2 of s) > 50 then
                    set end of wl to wRef
                end if
            end try
        end repeat
        set cnt to count of wl
        set needed to ${cellCoords.length}
        if cnt < needed then return cnt
        -- Pass 1
${posStatements}
        delay 0.2
        -- Pass 2
${pass2Statements}
    end tell
end tell
return ${cellCoords.length}`;
}

/**
 * fill モード: Finder の全ウィンドウを指定領域内にグリッド配置する AppleScript
 * @param {{x:number, y:number, w:number, h:number}} region - 配置領域
 * @param {number} subCols - 列数指定 (0=自動)
 * @param {number} subRows - 行数指定 (0=自動)
 */
function buildFinderRegionFillScript(region, subCols = 0, subRows = 0) {
  const colsPart = subCols > 0
    ? `set gridC to ${subCols}`
    : `if cnt ≤ 1 then
        set gridC to 1
    else if cnt ≤ 2 then
        set gridC to 2
    else if cnt ≤ 6 then
        set gridC to 3
    else
        set gridC to 4
    end if`;
  const rowsPart = subRows > 0
    ? `set gridR to ${subRows}`
    : `set gridR to (cnt + gridC - 1) div gridC`;

  return `tell application "Finder"
    activate
    delay 0.3
    set wl to every Finder window whose visible is true
    set cnt to count of wl
    if cnt = 0 then return 0

    set regionX to ${region.x}
    set regionY to ${region.y}
    set regionW to ${region.w}
    set regionH to ${region.h}

    ${colsPart}
    ${rowsPart}

    repeat with i from 1 to cnt
        set idx to i - 1
        set gC to idx mod gridC
        set gR to idx div gridC
        set x1 to regionX + (regionW * gC div gridC)
        set x2 to regionX + (regionW * (gC + 1) div gridC)
        set y1 to regionY + (regionH * gR div gridR)
        set y2 to regionY + (regionH * (gR + 1) div gridR)
        set bounds of item i of wl to {x1, y1, x2, y2}
    end repeat
    return cnt
end tell`;
}

/**
 * fill モード: System Events で全ウィンドウを指定領域内にグリッド配置する AppleScript
 * @param {string} processName - プロセス名
 * @param {{x:number, y:number, w:number, h:number}} region - 配置領域
 * @param {number} padding - パディング
 * @param {number} subCols - 列数指定 (0=自動)
 * @param {number} subRows - 行数指定 (0=自動)
 */
function buildSystemEventsRegionFillScript(processName, region, padding, subCols = 0, subRows = 0) {
  const escaped = processName.replace(/"/g, '\\"');
  const colsPart = subCols > 0
    ? `set gridC to ${subCols}`
    : `if cnt ≤ 1 then
            set gridC to 1
        else if cnt ≤ 2 then
            set gridC to 2
        else if cnt ≤ 6 then
            set gridC to 3
        else
            set gridC to 4
        end if`;
  const rowsPart = subRows > 0
    ? `set gridR to ${subRows}`
    : `set gridR to (cnt + gridC - 1) div gridC`;

  return `tell application "${escaped}" to activate
delay 0.3
tell application "System Events"
    tell process "${escaped}"
        set allWindows to every window
        set wl to {}
        repeat with wRef in allWindows
            try
                set s to size of wRef
                if (item 1 of s) > 50 and (item 2 of s) > 50 then
                    set end of wl to wRef
                end if
            end try
        end repeat
        set cnt to count of wl
        if cnt = 0 then return 0

        set regionX to ${region.x}
        set regionY to ${region.y}
        set regionW to ${region.w}
        set regionH to ${region.h}
        set pad to ${padding}

        ${colsPart}
        ${rowsPart}

        -- Pass 1: position のみ (ディスプレイ間移動を確実に)
        repeat with i from 1 to cnt
            try
                set idx to i - 1
                set gC to idx mod gridC
                set gR to idx div gridC
                set x1 to regionX + (regionW * gC div gridC) + pad
                set y1 to regionY + (regionH * gR div gridR) + pad
                set position of item i of wl to {x1, y1}
            end try
        end repeat
        delay 0.3

        -- Pass 2-3: position + size
        repeat with pass from 1 to 2
            repeat with i from 1 to cnt
                try
                    set idx to i - 1
                    set gC to idx mod gridC
                    set gR to idx div gridC
                    set x1 to regionX + (regionW * gC div gridC) + pad
                    set x2 to regionX + (regionW * (gC + 1) div gridC) - pad
                    set y1 to regionY + (regionH * gR div gridR) + pad
                    set y2 to regionY + (regionH * (gR + 1) div gridR) - pad
                    set position of item i of wl to {x1, y1}
                    set size of item i of wl to {x2 - x1, y2 - y1}
                end try
            end repeat
            if pass = 1 then delay 0.2
        end repeat
        return cnt
    end tell
end tell`;
}

/**
 * マルチアプリグリッド配置
 * @param {object} options - { displayIndex, rows, cols, padding, cells, mode }
 *   mode: 'one-per-cell' (デフォルト) = 各セルに1ウィンドウ
 *         'fill' = 各セル領域に全ウィンドウをグリッド配置
 */
async function arrangeMultiAppGrid(options) {
  const { displayIndex = 0, rows = 2, cols = 2, padding = 0, cells = [], mode = 'one-per-cell', subCols = 0, subRows = 0 } = options;

  if (cells.length === 0) {
    return { success: false, error: 'No cells specified', arranged: 0, details: [] };
  }

  try {
    // 1. ディスプレイ情報取得
    const displays = await getDisplayInfo();
    const dispIdx = displayIndex > 0 ? displayIndex : 1;
    if (dispIdx > displays.length) {
      return { success: false, error: 'Display not found', arranged: 0, details: [] };
    }
    const d = displays[dispIdx - 1];

    // メニューバー補正
    let screenX = d.asX;
    let screenY = d.asY;
    let screenW = d.visibleW;
    let screenH = d.visibleH;
    if (d.visibleH === d.frameH) {
      screenY += 25;
      screenH -= 25;
    }

    // 2. セルをアプリ名でグループ化し、各セルのピクセル座標を計算
    const appGroups = {};
    for (const cell of cells) {
      const { row, col, appName } = cell;
      if (row < 0 || row >= rows || col < 0 || col >= cols) continue;

      const x = screenX + Math.floor(screenW * col / cols);
      const y = screenY + Math.floor(screenH * row / rows);
      const w = Math.floor(screenW * (col + 1) / cols) - Math.floor(screenW * col / cols);
      const h = Math.floor(screenH * (row + 1) / rows) - Math.floor(screenH * row / rows);

      if (!appGroups[appName]) {
        appGroups[appName] = [];
      }
      appGroups[appName].push({ x, y, w, h });
    }

    // 3. アプリごとにAppleScript生成・実行
    const details = [];
    let totalArranged = 0;

    for (const [appName, coords] of Object.entries(appGroups)) {
      try {
        let script;

        if (mode === 'fill') {
          // fill モード: 全セル領域のバウンディングボックスを計算し、全ウィンドウをその中にグリッド配置
          const bx = Math.min(...coords.map(c => c.x));
          const by = Math.min(...coords.map(c => c.y));
          const bx2 = Math.max(...coords.map(c => c.x + c.w));
          const by2 = Math.max(...coords.map(c => c.y + c.h));
          const region = { x: bx, y: by, w: bx2 - bx, h: by2 - by };

          if (appName === 'Finder') {
            script = buildFinderRegionFillScript(region, subCols, subRows);
          } else {
            const appPadding = appName === 'Terminal' ? -5 : padding;
            script = buildSystemEventsRegionFillScript(appName, region, appPadding, subCols, subRows);
          }
        } else {
          // one-per-cell モード: 各セルに1ウィンドウ
          if (appName === 'Finder') {
            script = buildFinderMultiCellScript(coords);
          } else {
            const appPadding = appName === 'Terminal' ? -5 : padding;
            script = buildSystemEventsMultiCellScript(appName, coords, appPadding);
          }
        }

        const result = await runAppleScript(script, 30000);
        const arranged = parseInt(result.trim()) || 0;
        totalArranged += arranged;
        details.push({ appName, success: true });
      } catch (error) {
        console.error(`arrangeMultiAppGrid: ${appName} error:`, error.message);
        details.push({ appName, success: false });
      }
    }

    return {
      success: totalArranged > 0,
      arranged: totalArranged,
      details,
    };
  } catch (error) {
    console.error('arrangeMultiAppGrid error:', error);
    return { success: false, error: error.message, arranged: 0, details: [] };
  }
}

// =========================================================
// フィルタ付きグリッド配置 (windowIds 指定時のみ使用)
// =========================================================
//
// windowIds が指定された場合、対象ウィンドウだけをグリッド配置する。
// 既存の buildSystemEventsGridScript / buildFinderGridScript は一切変更しない。

/**
 * Terminal用フィルタ付きグリッドスクリプト
 * Terminal の card.windowId は AppleScript の `id of window` （数値）。
 * Terminal.app で id→name を取得し、System Events で name マッチで配置。
 */
function buildFilteredTerminalGridScript(options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0, padding = -5, windowIds = [] } = options;
  // windowIds は数値文字列（例: "3812"）なので、数値リストとして渡す
  const idsArray = windowIds.map(id => parseInt(id) || 0).join(', ');

  return `use framework "AppKit"
use scripting additions
${asDisplayInfo()}

set pad to ${padding}
set totalArranged to 0
set targetDisplay to ${displayIndex}
if targetDisplay = 0 and screenCount = 1 then set targetDisplay to 1
set targetIds to {${idsArray}}

tell application "Terminal" to activate
delay 0.3

-- Terminal.app で数値ID→ウィンドウ名を収集
set targetNames to {}
tell application "Terminal"
    repeat with w in every window
        try
            if targetIds contains (id of w) then
                set end of targetNames to name of w
            end if
        end try
    end repeat
end tell

tell application "System Events"
    tell process "Terminal"
        -- ウィンドウ収集: targetNames にマッチするウィンドウのみ
        set allWindows to every window
        set wl to {}
        repeat with wRef in allWindows
            try
                set s to size of wRef
                if (item 1 of s) > 50 and (item 2 of s) > 50 then
                    set wName to name of wRef
                    if targetNames contains wName then
                        set end of wl to wRef
                    end if
                end if
            end try
        end repeat
        set cnt to count of wl
        if cnt = 0 then return 0

        if targetDisplay > 0 and targetDisplay ≤ screenCount then
            set dInfo to item targetDisplay of displayInfo
            set screenX to x of dInfo
            set screenY to y of dInfo
            set screenW to w of dInfo
            set screenH to h of dInfo
            ${asGridCalc('cnt', cols, rows)}

            -- Pass 1: position のみ (ディスプレイ間移動)
            repeat with i from 1 to cnt
                try
                    set idx to i - 1
                    set x1 to screenX + (screenW * (idx mod gridC) div gridC) + pad
                    set y1 to screenY + (screenH * (idx div gridC) div gridR) + pad
                    set position of item i of wl to {x1, y1}
                end try
            end repeat
            delay 0.4

            -- Pass 2-3: position + size
            repeat with pass from 1 to 2
                repeat with i from 1 to cnt
                    try
                        set idx to i - 1
                        set gC to idx mod gridC
                        set gR to idx div gridC
                        set x1 to screenX + (screenW * gC div gridC) + pad
                        set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
                        set y1 to screenY + (screenH * gR div gridR) + pad
                        set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
                        set position of item i of wl to {x1, y1}
                        set size of item i of wl to {x2 - x1, y2 - y1}
                    end try
                end repeat
                if pass = 1 then delay 0.2
            end repeat
            set totalArranged to cnt
        else
            -- 自動モード: 各ディスプレイ内で配置
            repeat with dispIdx from 1 to screenCount
                set dInfo to item dispIdx of displayInfo
                set screenX to x of dInfo
                set screenY to y of dInfo
                set screenW to w of dInfo
                set screenH to h of dInfo

                set dw to {}
                repeat with i from 1 to cnt
                    try
                        set p to position of item i of wl
                        set s to size of item i of wl
                        set cx to (item 1 of p) + (item 1 of s) / 2
                        set cy to (item 2 of p) + (item 2 of s) / 2
                        if cx ≥ screenX and cx < (screenX + screenW) and cy ≥ screenY and cy < (screenY + screenH) then
                            set end of dw to (item i of wl)
                        end if
                    end try
                end repeat

                set dc to count of dw
                if dc > 0 then
                    ${asGridCalc('dc', cols, rows)}
                    repeat with pass from 1 to 2
                        repeat with j from 1 to dc
                            try
                                set idx to j - 1
                                set gC to idx mod gridC
                                set gR to idx div gridC
                                set x1 to screenX + (screenW * gC div gridC) + pad
                                set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
                                set y1 to screenY + (screenH * gR div gridR) + pad
                                set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
                                set position of (item j of dw) to {x1, y1}
                                set size of (item j of dw) to {x2 - x1, y2 - y1}
                            end try
                        end repeat
                        if pass = 1 then delay 0.15
                    end repeat
                    set totalArranged to totalArranged + dc
                end if
            end repeat
        end if

        -- 配置済みウィンドウだけを前面に持ってくる
        repeat with i from 1 to cnt
            try
                perform action "AXRaise" of item i of wl
            end try
        end repeat
    end tell
end tell
return totalArranged`;
}

/**
 * Finder用フィルタ付きグリッドスクリプト
 * Finder の card.windowId は `id of Finder window` の数値を文字列化したもの。
 * 数値リストとして渡して `id of fw` で直接フィルタ。
 */
function buildFilteredFinderGridScript(options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0, padding = 0, windowIds = [] } = options;
  const idsArray = windowIds.map(id => parseInt(id) || 0).join(', ');

  return `use framework "AppKit"
use scripting additions
${asDisplayInfo()}

set pad to ${padding}
set totalArranged to 0
set targetDisplay to ${displayIndex}
if targetDisplay = 0 and screenCount = 1 then set targetDisplay to 1
set targetIds to {${idsArray}}

tell application "Finder"
    activate
    set allFW to every Finder window whose visible is true
    set wl to {}
    repeat with fw in allFW
        if targetIds contains (id of fw) then
            set end of wl to fw
        end if
    end repeat
    set cnt to count of wl
    if cnt = 0 then return 0

    if targetDisplay > 0 and targetDisplay ≤ screenCount then
        set dInfo to item targetDisplay of displayInfo
        set screenX to x of dInfo
        set screenY to y of dInfo
        set screenW to w of dInfo
        set screenH to h of dInfo
        ${asGridCalc('cnt', cols, rows)}

        repeat with i from 1 to cnt
            set idx to i - 1
            set gC to idx mod gridC
            set gR to idx div gridC
            set x1 to screenX + (screenW * gC div gridC) + pad
            set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
            set y1 to screenY + (screenH * gR div gridR) + pad
            set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
            set bounds of item i of wl to {x1, y1, x2, y2}
            set totalArranged to totalArranged + 1
        end repeat
    else
        repeat with dispIdx from 1 to screenCount
            set dInfo to item dispIdx of displayInfo
            set screenX to x of dInfo
            set screenY to y of dInfo
            set screenW to w of dInfo
            set screenH to h of dInfo

            set dw to {}
            repeat with i from 1 to cnt
                set b to bounds of item i of wl
                set cx to (item 1 of b) + ((item 3 of b) - (item 1 of b)) / 2
                set cy to (item 2 of b) + ((item 4 of b) - (item 2 of b)) / 2
                if cx ≥ screenX and cx < (screenX + screenW) and cy ≥ screenY and cy < (screenY + screenH) then
                    set end of dw to (item i of wl)
                end if
            end repeat

            set dc to count of dw
            if dc > 0 then
                ${asGridCalc('dc', cols, rows)}
                repeat with j from 1 to dc
                    set idx to j - 1
                    set gC to idx mod gridC
                    set gR to idx div gridC
                    set x1 to screenX + (screenW * gC div gridC) + pad
                    set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
                    set y1 to screenY + (screenH * gR div gridR) + pad
                    set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
                    set bounds of (item j of dw) to {x1, y1, x2, y2}
                    set totalArranged to totalArranged + 1
                end repeat
            end if
        end repeat
    end if
    return totalArranged
end tell`;
}

/**
 * 汎用アプリ用フィルタ付きグリッドスクリプト
 * windowId の形式は "AppName:WindowTitle" （windowManager.cjs の getGenericAppWindows 参照）
 * コロン以降のウィンドウ名でマッチングする。
 */
function buildFilteredGenericGridScript(processName, options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0, padding = -5, windowIds = [] } = options;
  const escaped = processName.replace(/"/g, '\\"');
  // windowIds から名前部分を抽出: "AppName:WindowTitle" or "AppName:WindowTitle-2"
  const namesArray = windowIds.map(id => {
    const colonIdx = id.indexOf(':');
    let name = colonIdx >= 0 ? id.substring(colonIdx + 1) : id;
    // 末尾の重複連番サフィックス "-2", "-3" を除去（同名ウィンドウのIDに付与される）
    name = name.replace(/-\d+$/, '');
    return `"${name.replace(/"/g, '\\"')}"`;
  }).join(', ');

  return `use framework "AppKit"
use scripting additions
${asDisplayInfo()}

set pad to ${padding}
set totalArranged to 0
set targetDisplay to ${displayIndex}
if targetDisplay = 0 and screenCount = 1 then set targetDisplay to 1
set targetNames to {${namesArray}}

tell application "${escaped}" to activate
delay 0.3

tell application "System Events"
    tell process "${escaped}"
        set allWindows to every window
        set wl to {}
        repeat with wRef in allWindows
            try
                set s to size of wRef
                if (item 1 of s) > 50 and (item 2 of s) > 50 then
                    set wName to name of wRef
                    if targetNames contains wName then
                        set end of wl to wRef
                    end if
                end if
            end try
        end repeat
        set cnt to count of wl
        if cnt = 0 then return 0

        if targetDisplay > 0 and targetDisplay ≤ screenCount then
            set dInfo to item targetDisplay of displayInfo
            set screenX to x of dInfo
            set screenY to y of dInfo
            set screenW to w of dInfo
            set screenH to h of dInfo
            ${asGridCalc('cnt', cols, rows)}

            repeat with i from 1 to cnt
                try
                    set idx to i - 1
                    set x1 to screenX + (screenW * (idx mod gridC) div gridC) + pad
                    set y1 to screenY + (screenH * (idx div gridC) div gridR) + pad
                    set position of item i of wl to {x1, y1}
                end try
            end repeat
            delay 0.4

            repeat with pass from 1 to 2
                repeat with i from 1 to cnt
                    try
                        set idx to i - 1
                        set gC to idx mod gridC
                        set gR to idx div gridC
                        set x1 to screenX + (screenW * gC div gridC) + pad
                        set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
                        set y1 to screenY + (screenH * gR div gridR) + pad
                        set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
                        set position of item i of wl to {x1, y1}
                        set size of item i of wl to {x2 - x1, y2 - y1}
                    end try
                end repeat
                if pass = 1 then delay 0.2
            end repeat
            set totalArranged to cnt
        else
            repeat with dispIdx from 1 to screenCount
                set dInfo to item dispIdx of displayInfo
                set screenX to x of dInfo
                set screenY to y of dInfo
                set screenW to w of dInfo
                set screenH to h of dInfo

                set dw to {}
                repeat with i from 1 to cnt
                    try
                        set p to position of item i of wl
                        set s to size of item i of wl
                        set cx to (item 1 of p) + (item 1 of s) / 2
                        set cy to (item 2 of p) + (item 2 of s) / 2
                        if cx ≥ screenX and cx < (screenX + screenW) and cy ≥ screenY and cy < (screenY + screenH) then
                            set end of dw to (item i of wl)
                        end if
                    end try
                end repeat

                set dc to count of dw
                if dc > 0 then
                    ${asGridCalc('dc', cols, rows)}
                    repeat with pass from 1 to 2
                        repeat with j from 1 to dc
                            try
                                set idx to j - 1
                                set gC to idx mod gridC
                                set gR to idx div gridC
                                set x1 to screenX + (screenW * gC div gridC) + pad
                                set x2 to screenX + (screenW * (gC + 1) div gridC) - pad
                                set y1 to screenY + (screenH * gR div gridR) + pad
                                set y2 to screenY + (screenH * (gR + 1) div gridR) - pad
                                set position of (item j of dw) to {x1, y1}
                                set size of (item j of dw) to {x2 - x1, y2 - y1}
                            end try
                        end repeat
                        if pass = 1 then delay 0.15
                    end repeat
                    set totalArranged to totalArranged + dc
                end if
            end repeat
        end if

        -- 配置済みウィンドウだけを前面に持ってくる
        repeat with i from 1 to cnt
            try
                perform action "AXRaise" of item i of wl
            end try
        end repeat
    end tell
end tell
return totalArranged`;
}

// =========================================================
// 公開 API
// =========================================================

/** 配置完了後に対象アプリを前面に持ってくる（activate + frontmost のみ） */
function bringAppToFront(appName) {
  const escaped = appName.replace(/"/g, '\\"');
  return runAppleScript(`
tell application "${escaped}" to activate
delay 0.1
tell application "System Events"
    set frontmost of process "${escaped}" to true
end tell`, 5000).catch(() => {});
}

async function arrangeTerminalGrid(options = {}) {
  try {
    const scriptFn = Array.isArray(options.windowIds) && options.windowIds.length > 0
      ? () => buildFilteredTerminalGridScript(options)
      : () => buildSystemEventsGridScript('Terminal', options);
    const result = await runAppleScript(scriptFn(), 30000);
    const arranged = parseInt(result.trim()) || 0;
    if (arranged === 0) return { success: false, error: 'ウィンドウが見つかりません', arranged: 0 };
    return { success: true, arranged };
  } catch (error) {
    console.error('arrangeTerminalGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

async function arrangeFinderGrid(options = {}) {
  try {
    const scriptFn = Array.isArray(options.windowIds) && options.windowIds.length > 0
      ? () => buildFilteredFinderGridScript(options)
      : () => buildFinderGridScript(options);
    const result = await runAppleScript(scriptFn(), 20000);
    const arranged = parseInt(result.trim()) || 0;
    if (arranged === 0) return { success: false, error: 'ウィンドウが見つかりません', arranged: 0 };
    return { success: true, arranged };
  } catch (error) {
    console.error('arrangeFinderGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

async function arrangeGenericGrid(appName, options = {}) {
  try {
    const scriptFn = Array.isArray(options.windowIds) && options.windowIds.length > 0
      ? () => buildFilteredGenericGridScript(appName, options)
      : () => buildSystemEventsGridScript(appName, options);
    const result = await runAppleScript(scriptFn(), 45000);
    const arranged = parseInt(result.trim()) || 0;
    if (arranged === 0) return { success: false, error: 'ウィンドウが見つかりません', arranged: 0 };
    return { success: true, arranged };
  } catch (error) {
    console.error('arrangeGenericGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

module.exports = {
  runAppleScript,
  getDisplayInfo,
  arrangeTerminalGrid,
  arrangeFinderGrid,
  arrangeGenericGrid,
  arrangeMultiAppGrid,
  buildTerminalGridScript: (opts) => buildSystemEventsGridScript('Terminal', opts),
  buildFinderGridScript,
  buildGenericGridScript: (appName, opts) => buildSystemEventsGridScript(appName, opts),
};
