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
// 公開 API
// =========================================================

async function arrangeTerminalGrid(options = {}) {
  try {
    const result = await runAppleScript(buildSystemEventsGridScript('Terminal', options), 30000);
    return { success: true, arranged: parseInt(result.trim()) || 0 };
  } catch (error) {
    console.error('arrangeTerminalGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

async function arrangeFinderGrid(options = {}) {
  try {
    const result = await runAppleScript(buildFinderGridScript(options), 20000);
    return { success: true, arranged: parseInt(result.trim()) || 0 };
  } catch (error) {
    console.error('arrangeFinderGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

async function arrangeGenericGrid(appName, options = {}) {
  try {
    const result = await runAppleScript(buildSystemEventsGridScript(appName, options), 45000);
    return { success: true, arranged: parseInt(result.trim()) || 0 };
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
  buildTerminalGridScript: (opts) => buildSystemEventsGridScript('Terminal', opts),
  buildFinderGridScript,
  buildGenericGridScript: (appName, opts) => buildSystemEventsGridScript(appName, opts),
};
