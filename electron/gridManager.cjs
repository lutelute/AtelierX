/**
 * Grid Manager - ウィンドウグリッド配置モジュール
 *
 * terminal_grid.sh / finder_grid.sh と同等のロジックを実装
 * 元スクリプトの更新に追従しやすいよう、ロジックを分離
 *
 * @see ../terminal_grid/terminal_grid.sh
 * @see ../terminal_grid/finder_grid.sh
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// =====================================================
// AppleScript実行ヘルパー
// =====================================================

/**
 * AppleScriptを一時ファイル経由で実行
 * @param {string} script - AppleScriptコード
 * @returns {string} 実行結果
 */
function runAppleScript(script, timeout = 15000) {
  const tmpFile = path.join(os.tmpdir(), `applescript-${Date.now()}.scpt`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf-8');
    const result = execSync(`osascript "${tmpFile}"`, { encoding: 'utf-8', timeout });
    return result;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

// =====================================================
// ディスプレイ情報取得
// =====================================================

/**
 * NSScreenを使用してディスプレイ情報を取得
 * terminal_grid.sh: get_screen_info() と同等
 */
const SCRIPT_GET_DISPLAYS = `
use framework "AppKit"
use scripting additions

set screenList to current application's NSScreen's screens()
set mainScreen to item 1 of screenList
set mainFrame to mainScreen's frame()
set mainHeight to (current application's NSHeight(mainFrame)) as integer
set output to ""

repeat with i from 1 to count of screenList
    set aScreen to item i of screenList
    set frame to aScreen's frame()
    set visibleFrame to aScreen's visibleFrame()

    set fx to (current application's NSMinX(frame)) as integer
    set fy to (current application's NSMinY(frame)) as integer
    set fw to (current application's NSWidth(frame)) as integer
    set fh to (current application's NSHeight(frame)) as integer

    set vx to (current application's NSMinX(visibleFrame)) as integer
    set vy to (current application's NSMinY(visibleFrame)) as integer
    set vw to (current application's NSWidth(visibleFrame)) as integer
    set vh to (current application's NSHeight(visibleFrame)) as integer

    set asX to fx
    set asY to mainHeight - (fy + fh)

    set output to output & i & "|" & fx & "|" & fy & "|" & fw & "|" & fh & "|" & asX & "|" & asY & "|" & vw & "|" & vh & linefeed
end repeat

return output
`;

/**
 * ディスプレイ情報を取得
 * @returns {Array<DisplayInfo>} ディスプレイ情報の配列
 */
function getDisplayInfo() {
  try {
    const result = runAppleScript(SCRIPT_GET_DISPLAYS);
    const displays = [];
    result.trim().split('\n').forEach(line => {
      const parts = line.split('|');
      if (parts.length >= 9) {
        displays.push({
          index: parseInt(parts[0]),
          frameX: parseInt(parts[1]),
          frameY: parseInt(parts[2]),
          frameW: parseInt(parts[3]),
          frameH: parseInt(parts[4]),
          asX: parseInt(parts[5]),
          asY: parseInt(parts[6]),
          visibleW: parseInt(parts[7]),
          visibleH: parseInt(parts[8]),
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

// =====================================================
// Terminal.app グリッド配置
// =====================================================

/**
 * Terminal.app ウィンドウをグリッド配置
 * terminal_grid.sh と同等のロジック
 *
 * 特殊対応:
 * - globalTop: 外部ディスプレイの座標系調整
 * - screenW > 2048: 幅広ディスプレイの制限
 * - menuOffset: メニューバー/ツールバー分のオフセット
 * - ハイブリッドアプローチ: Terminal APIでメインに移動後、System Eventsで配置
 *   （外部ディスプレイでTerminal APIのboundsが正しく動作しないため）
 *
 * 制限事項:
 * - System Eventsが認識できるウィンドウ数に制限がある場合があります
 *   （macOS/Terminal.appの制限により、一部ウィンドウが配置されない可能性）
 *
 * @param {Object} options
 * @param {number} options.cols - 列数（0=自動）
 * @param {number} options.rows - 行数（0=自動）
 * @param {number} options.displayIndex - ターゲットディスプレイ（0=各ディスプレイ内で自動）
 * @param {number} options.padding - パディング（デフォルト: 5）
 */
function buildTerminalGridScript(options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0, padding = 5 } = options;

  return `
use framework "AppKit"

-- ディスプレイ情報を取得
set screenList to current application's NSScreen's screens()
set screenCount to count of screenList
set mainFrame to (item 1 of screenList)'s frame()
set mainH to (current application's NSHeight(mainFrame)) as integer

-- グローバルデスクトップの上端を計算（Terminal.appはこれをy=0として使用）
set globalTop to 0
repeat with i from 1 to screenCount
    set aScreen to item i of screenList
    set frm to aScreen's frame()
    set fy to (current application's NSMinY(frm)) as integer
    set fh to (current application's NSHeight(frm)) as integer
    set screenTop to mainH - (fy + fh)
    if screenTop < globalTop then
        set globalTop to screenTop
    end if
end repeat

-- 各ディスプレイの座標情報を収集
set displayInfo to {}
repeat with i from 1 to screenCount
    set aScreen to item i of screenList
    set vf to aScreen's visibleFrame()

    set vx to (current application's NSMinX(vf)) as integer
    set vy to (current application's NSMinY(vf)) as integer
    set vw to (current application's NSWidth(vf)) as integer
    set vh to (current application's NSHeight(vf)) as integer

    set asX to vx
    set asY to (mainH - vy - vh)

    set end of displayInfo to {x:asX, y:asY, w:vw, h:vh, globalTop:globalTop}
end repeat

set pad to ${padding}
set totalArranged to 0
set targetDisplay to ${displayIndex}
set menuOffset to 0

-- Terminal.appからウィンドウ数を取得
tell application "Terminal"
    set wl to every window whose visible is true
    set cnt to count of wl
    if cnt = 0 then return 0
end tell

-- ターゲットディスプレイが指定されている場合
if targetDisplay > 0 and targetDisplay ≤ screenCount then
    set dInfo to item targetDisplay of displayInfo
    set screenX to x of dInfo
    set screenY to y of dInfo
    set screenW to w of dInfo
    set screenH to h of dInfo
    set gTop to globalTop of dInfo

    -- グリッドサイズを決定
    if ${cols} > 0 then
        set gridCols to ${cols}
    else if cnt ≤ 2 then
        set gridCols to 2
    else if cnt ≤ 4 then
        set gridCols to 2
    else if cnt ≤ 6 then
        set gridCols to 3
    else
        set gridCols to 4
    end if
    if ${rows} > 0 then
        set gridRows to ${rows}
    else
        set gridRows to (cnt + gridCols - 1) div gridCols
    end if

    -- 幅広ディスプレイでは右端で配置が崩れるため制限
    if screenW > 2048 then
        set screenW to 2048
    end if

    -- 外部ディスプレイの場合: ハイブリッドアプローチ
    -- 1. Terminal APIで全ウィンドウをメインディスプレイに移動
    -- 2. System Eventsで正確に位置設定
    if gTop < 0 then
        tell application "Terminal"
            repeat with w in (every window whose visible is true)
                set bounds of w to {100, 100, 600, 500}
            end repeat
        end tell
        delay 0.5

        -- System Eventsで配置（比例分割）
        tell application "System Events"
            tell process "Terminal"
                set windowList to every window
                set seCnt to count of windowList

                repeat with i from 1 to seCnt
                    set idx to i - 1
                    set gridCol to idx mod gridCols
                    set gridRow to idx div gridCols
                    set x1 to screenX + (screenW * gridCol div gridCols) + pad
                    set x2 to screenX + (screenW * (gridCol + 1) div gridCols)
                    set y1 to screenY + (screenH * gridRow div gridRows) + pad
                    set y2 to screenY + (screenH * (gridRow + 1) div gridRows)

                    set position of window i to {x1, y1}
                    set size of window i to {x2 - x1, y2 - y1}
                    set totalArranged to totalArranged + 1
                end repeat
            end tell
        end tell
    else
        -- メインディスプレイの場合: Terminal APIで直接配置（比例分割）
        tell application "Terminal"
            set wl to every window whose visible is true
            repeat with i from 1 to cnt
                set idx to i - 1
                set gridCol to idx mod gridCols
                set gridRow to idx div gridCols
                set x1 to screenX + (screenW * gridCol div gridCols) + pad
                set x2 to screenX + (screenW * (gridCol + 1) div gridCols)
                set y1 to screenY + (screenH * gridRow div gridRows) + pad
                set y2 to screenY + (screenH * (gridRow + 1) div gridRows)
                set bounds of item i of wl to {x1, y1, x2, y2}
                set totalArranged to totalArranged + 1
            end repeat
        end tell
    end if
else
    -- 自動モード: 各ディスプレイ内で配置
    tell application "Terminal"
        set wl to every window whose visible is true
    end tell

    repeat with dispIdx from 1 to screenCount
        set dInfo to item dispIdx of displayInfo
        set screenX to x of dInfo
        set screenY to y of dInfo
        set screenW to w of dInfo
        set screenH to h of dInfo

        set dispX1 to screenX
        set dispY1 to screenY
        set dispX2 to screenX + screenW
        set dispY2 to screenY + screenH

        -- このディスプレイのウィンドウを収集
        set dispWindows to {}
        tell application "Terminal"
            repeat with i from 1 to cnt
                set b to bounds of item i of wl
                set wx to item 1 of b
                set wy to item 2 of b
                set winCenterX to wx + ((item 3 of b) - wx) / 2
                set winCenterY to wy + ((item 4 of b) - wy) / 2

                if winCenterX ≥ dispX1 and winCenterX < dispX2 and winCenterY ≥ dispY1 and winCenterY < dispY2 then
                    set end of dispWindows to i
                end if
            end repeat
        end tell

        set dispCnt to count of dispWindows
        if dispCnt > 0 then
            -- グリッドサイズを決定
            if ${cols} > 0 then
                set gridCols to ${cols}
            else if dispCnt ≤ 2 then
                set gridCols to 2
            else if dispCnt ≤ 4 then
                set gridCols to 2
            else if dispCnt ≤ 6 then
                set gridCols to 3
            else
                set gridCols to 4
            end if
            set gridRows to (dispCnt + gridCols - 1) div gridCols

            -- 幅制限
            if screenW > 2048 then
                set screenW to 2048
            end if

            -- 外部ディスプレイ判定
            set isExternal to (screenY < 0)

            if isExternal then
                -- 外部ディスプレイ: まずメインに移動してからSystem Eventsで配置
                tell application "Terminal"
                    repeat with winIdx in dispWindows
                        set bounds of item winIdx of wl to {100, 100, 600, 500}
                    end repeat
                end tell
                delay 0.3

                tell application "System Events"
                    tell process "Terminal"
                        set windowList to every window
                        set seCnt to count of windowList

                        repeat with j from 1 to dispCnt
                            if j ≤ seCnt then
                                set idx to j - 1
                                set gridCol to idx mod gridCols
                                set gridRow to idx div gridCols
                                set x1 to screenX + (screenW * gridCol div gridCols) + pad
                                set x2 to screenX + (screenW * (gridCol + 1) div gridCols)
                                set y1 to screenY + (screenH * gridRow div gridRows) + pad
                                set y2 to screenY + (screenH * (gridRow + 1) div gridRows)

                                set position of window j to {x1, y1}
                                set size of window j to {x2 - x1, y2 - y1}
                                set totalArranged to totalArranged + 1
                            end if
                        end repeat
                    end tell
                end tell
            else
                -- メインディスプレイ: Terminal APIで直接配置（比例分割）
                tell application "Terminal"
                    repeat with j from 1 to dispCnt
                        set winIdx to item j of dispWindows
                        set idx to j - 1
                        set gridCol to idx mod gridCols
                        set gridRow to idx div gridCols
                        set x1 to screenX + (screenW * gridCol div gridCols) + pad
                        set x2 to screenX + (screenW * (gridCol + 1) div gridCols)
                        set y1 to screenY + (screenH * gridRow div gridRows) + pad
                        set y2 to screenY + (screenH * (gridRow + 1) div gridRows)
                        set bounds of item winIdx of wl to {x1, y1, x2, y2}
                        set totalArranged to totalArranged + 1
                    end repeat
                end tell
            end if
        end if
    end repeat
end if

return totalArranged
`;
}

/**
 * Terminalウィンドウをグリッド配置
 * @param {Object} options - 配置オプション
 * @returns {Object} { success: boolean, arranged: number, error?: string }
 */
function arrangeTerminalGrid(options = {}) {
  try {
    const script = buildTerminalGridScript(options);
    const result = runAppleScript(script);
    return { success: true, arranged: parseInt(result.trim()) || 0 };
  } catch (error) {
    console.error('arrangeTerminalGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

// =====================================================
// Finder グリッド配置
// =====================================================

/**
 * Finder ウィンドウをグリッド配置
 * finder_grid.sh と同等のロジック
 *
 * Finderは Terminal.app と異なり、座標系の制限がないため
 * 特殊な回避策は不要
 *
 * @param {Object} options
 * @param {number} options.cols - 列数（0=自動）
 * @param {number} options.rows - 行数（0=自動）
 * @param {number} options.displayIndex - ターゲットディスプレイ（0=各ディスプレイ内で自動）
 * @param {number} options.padding - パディング（デフォルト: 5）
 */
function buildFinderGridScript(options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0, padding = 5 } = options;

  return `
use framework "AppKit"

set screenList to current application's NSScreen's screens()
set screenCount to count of screenList
set mainFrame to (item 1 of screenList)'s frame()
set mainH to (current application's NSHeight(mainFrame)) as integer

set displayInfo to {}
repeat with i from 1 to screenCount
    set aScreen to item i of screenList
    set frm to aScreen's frame()
    set vf to aScreen's visibleFrame()

    set vx to (current application's NSMinX(vf)) as integer
    set vy to (current application's NSMinY(vf)) as integer
    set vw to (current application's NSWidth(vf)) as integer
    set vh to (current application's NSHeight(vf)) as integer

    set asX to vx
    set asY to (mainH - vy - vh)

    set end of displayInfo to {x:asX, y:asY, w:vw, h:vh}
end repeat

set pad to ${padding}
set totalArranged to 0
set targetDisplay to ${displayIndex}

tell application "Finder"
    set wl to every Finder window whose visible is true
    set cnt to count of wl
    if cnt = 0 then return 0

    if targetDisplay > 0 and targetDisplay ≤ screenCount then
        set dInfo to item targetDisplay of displayInfo
        set screenX to x of dInfo
        set screenY to y of dInfo
        set screenW to w of dInfo
        set screenH to h of dInfo

        if ${cols} > 0 then
            set c to ${cols}
        else if cnt ≤ 2 then
            set c to 2
        else if cnt ≤ 4 then
            set c to 2
        else if cnt ≤ 6 then
            set c to 3
        else
            set c to 4
        end if

        if ${rows} > 0 then
            set r to ${rows}
        else
            set r to (cnt + c - 1) div c
        end if

        repeat with i from 1 to cnt
            set idx to i - 1
            set gCol to idx mod c
            set gRow to idx div c
            set x1 to screenX + (screenW * gCol div c) + pad
            set x2 to screenX + (screenW * (gCol + 1) div c)
            set y1 to screenY + (screenH * gRow div r) + pad
            set y2 to screenY + (screenH * (gRow + 1) div r)
            set bounds of item i of wl to {x1, y1, x2, y2}
            set totalArranged to totalArranged + 1
        end repeat
    else
        -- 自動モード: 各ディスプレイ内で配置
        repeat with dispIdx from 1 to screenCount
            set dInfo to item dispIdx of displayInfo
            set screenX to x of dInfo
            set screenY to y of dInfo
            set screenW to w of dInfo
            set screenH to h of dInfo

            set dispX1 to screenX
            set dispY1 to screenY
            set dispX2 to screenX + screenW
            set dispY2 to screenY + screenH

            set dispWindows to {}
            repeat with i from 1 to cnt
                set b to bounds of item i of wl
                set wx to item 1 of b
                set wy to item 2 of b
                set winCenterX to wx + ((item 3 of b) - wx) / 2
                set winCenterY to wy + ((item 4 of b) - wy) / 2

                if winCenterX ≥ dispX1 and winCenterX < dispX2 and winCenterY ≥ dispY1 and winCenterY < dispY2 then
                    set end of dispWindows to i
                end if
            end repeat

            set dispCnt to count of dispWindows
            if dispCnt > 0 then
                if ${cols} > 0 then
                    set c to ${cols}
                else if dispCnt ≤ 2 then
                    set c to 2
                else if dispCnt ≤ 4 then
                    set c to 2
                else if dispCnt ≤ 6 then
                    set c to 3
                else
                    set c to 4
                end if
                set r to (dispCnt + c - 1) div c

                repeat with j from 1 to dispCnt
                    set winIdx to item j of dispWindows
                    set idx to j - 1
                    set gCol to idx mod c
                    set gRow to idx div c
                    set x1 to screenX + (screenW * gCol div c) + pad
                    set x2 to screenX + (screenW * (gCol + 1) div c)
                    set y1 to screenY + (screenH * gRow div r) + pad
                    set y2 to screenY + (screenH * (gRow + 1) div r)
                    set bounds of item winIdx of wl to {x1, y1, x2, y2}
                    set totalArranged to totalArranged + 1
                end repeat
            end if
        end repeat
    end if

    return totalArranged
end tell
`;
}

/**
 * Finderウィンドウをグリッド配置
 * @param {Object} options - 配置オプション
 * @returns {Object} { success: boolean, arranged: number, error?: string }
 */
function arrangeFinderGrid(options = {}) {
  try {
    const script = buildFinderGridScript(options);
    const result = runAppleScript(script);
    return { success: true, arranged: parseInt(result.trim()) || 0 };
  } catch (error) {
    console.error('arrangeFinderGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

// =====================================================
// 汎用アプリ グリッド配置 (System Events経由)
// =====================================================

/**
 * 任意のアプリウィンドウをSystem Events経由でグリッド配置
 *
 * Terminal/Finderは専用APIを持つが、それ以外のアプリは
 * System Eventsでposition/sizeを設定して配置する
 *
 * @param {string} appName - macOSアプリ名 (例: 'Vivaldi', 'Obsidian')
 * @param {Object} options
 * @param {number} options.cols - 列数（0=自動）
 * @param {number} options.rows - 行数（0=自動）
 * @param {number} options.displayIndex - ターゲットディスプレイ（0=自動）
 * @param {number} options.padding - パディング（デフォルト: 5）
 */
function buildGenericGridScript(appName, options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0, padding = 5 } = options;
  const escapedAppName = appName.replace(/"/g, '\\"');

  // 注意: AppleScript変数名に row/col/column 等を使うと
  // Excel等のアプリでスプレッドシート用語と衝突するため
  // gridCol/gridRow/gridC/gridR を使用する
  return `
use framework "AppKit"

set screenList to current application's NSScreen's screens()
set screenCount to count of screenList
set mainFrame to (item 1 of screenList)'s frame()
set mainH to (current application's NSHeight(mainFrame)) as integer

set displayInfo to {}
repeat with i from 1 to screenCount
    set aScreen to item i of screenList
    set vf to aScreen's visibleFrame()
    set vx to (current application's NSMinX(vf)) as integer
    set vy to (current application's NSMinY(vf)) as integer
    set vw to (current application's NSWidth(vf)) as integer
    set vh to (current application's NSHeight(vf)) as integer
    set asX to vx
    set asY to (mainH - vy - vh)
    set end of displayInfo to {x:asX, y:asY, w:vw, h:vh}
end repeat

set pad to ${padding}
set totalArranged to 0
set targetDisplay to ${displayIndex}
set menuOffset to 0

tell application "System Events"
    if not (exists process "${escapedAppName}") then return 0
    tell process "${escapedAppName}"
        set wl to every window
        set cnt to count of wl
        if cnt = 0 then return 0

        if targetDisplay > 0 and targetDisplay ≤ screenCount then
            set dInfo to item targetDisplay of displayInfo
            set screenX to x of dInfo
            set screenY to y of dInfo
            set screenW to w of dInfo
            set screenH to h of dInfo

            if ${cols} > 0 then
                set gridC to ${cols}
            else if cnt ≤ 2 then
                set gridC to 2
            else if cnt ≤ 4 then
                set gridC to 2
            else if cnt ≤ 6 then
                set gridC to 3
            else
                set gridC to 4
            end if

            if ${rows} > 0 then
                set gridR to ${rows}
            else
                set gridR to (cnt + gridC - 1) div gridC
            end if

            repeat with i from 1 to cnt
                set idx to i - 1
                set gridCol to idx mod gridC
                set gridRow to idx div gridC
                set x1 to screenX + (screenW * gridCol div gridC) + pad
                set x2 to screenX + (screenW * (gridCol + 1) div gridC)
                set y1 to screenY + (screenH * gridRow div gridR) + pad
                set y2 to screenY + (screenH * (gridRow + 1) div gridR)
                set position of window i to {x1, y1}
                set size of window i to {x2 - x1, y2 - y1}
                set totalArranged to totalArranged + 1
            end repeat
        else
            set dInfo to item 1 of displayInfo
            set screenX to x of dInfo
            set screenY to y of dInfo
            set screenW to w of dInfo
            set screenH to h of dInfo

            if ${cols} > 0 then
                set gridC to ${cols}
            else if cnt ≤ 2 then
                set gridC to 2
            else if cnt ≤ 4 then
                set gridC to 2
            else if cnt ≤ 6 then
                set gridC to 3
            else
                set gridC to 4
            end if

            if ${rows} > 0 then
                set gridR to ${rows}
            else
                set gridR to (cnt + gridC - 1) div gridC
            end if

            repeat with i from 1 to cnt
                set idx to i - 1
                set gridCol to idx mod gridC
                set gridRow to idx div gridC
                set x1 to screenX + (screenW * gridCol div gridC) + pad
                set x2 to screenX + (screenW * (gridCol + 1) div gridC)
                set y1 to screenY + (screenH * gridRow div gridR) + pad
                set y2 to screenY + (screenH * (gridRow + 1) div gridR)
                set position of window i to {x1, y1}
                set size of window i to {x2 - x1, y2 - y1}
                set totalArranged to totalArranged + 1
            end repeat
        end if
    end tell
end tell

return totalArranged
`;
}

/**
 * 汎用アプリウィンドウをグリッド配置
 * @param {string} appName - macOSアプリ名
 * @param {Object} options - 配置オプション
 * @returns {Object} { success: boolean, arranged: number, error?: string }
 */
function arrangeGenericGrid(appName, options = {}) {
  try {
    const script = buildGenericGridScript(appName, options);
    const result = runAppleScript(script);
    return { success: true, arranged: parseInt(result.trim()) || 0 };
  } catch (error) {
    console.error('arrangeGenericGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

// =====================================================
// エクスポート
// =====================================================

module.exports = {
  runAppleScript,
  getDisplayInfo,
  arrangeTerminalGrid,
  arrangeFinderGrid,
  arrangeGenericGrid,
  // スクリプトビルダーもエクスポート（テスト・デバッグ用）
  buildTerminalGridScript,
  buildFinderGridScript,
  buildGenericGridScript,
};
