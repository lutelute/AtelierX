/**
 * Plugin API - プラグインに提供するAPI
 *
 * プラグインの onload(api) で渡されるAPIオブジェクト
 */

// 登録されたグリッドレイアウト
const registeredGridLayouts = new Map();

// 登録されたエクスポートフォーマット
const registeredExportFormats = new Map();

// 登録されたカードアクション
const registeredCardActions = new Map();

/**
 * プラグイン用APIを作成
 * @param {string} pluginId - プラグインID
 * @param {function} getSettings - 設定取得関数
 * @param {function} saveSettings - 設定保存関数
 */
function createPluginAPI(pluginId, getSettings, saveSettings) {
  return {
    /**
     * グリッドレイアウトを登録
     * @param {Object} layout - レイアウト設定
     * @param {string} layout.id - レイアウトID
     * @param {string} layout.name - 表示名
     * @param {string} [layout.description] - 説明
     * @param {number} layout.cols - 列数
     * @param {number} layout.rows - 行数
     * @param {number} [layout.padding] - パディング
     */
    registerGridLayout(layout) {
      if (!layout.id || !layout.name || !layout.cols || !layout.rows) {
        console.error(`[Plugin:${pluginId}] Invalid layout:`, layout);
        return;
      }
      const fullId = `${pluginId}:${layout.id}`;
      registeredGridLayouts.set(fullId, {
        ...layout,
        id: fullId,
        pluginId,
      });
      console.log(`[Plugin:${pluginId}] Registered grid layout: ${layout.name}`);
    },

    /**
     * グリッドレイアウトを登録解除
     * @param {string} layoutId - レイアウトID
     */
    unregisterGridLayout(layoutId) {
      const fullId = `${pluginId}:${layoutId}`;
      registeredGridLayouts.delete(fullId);
      console.log(`[Plugin:${pluginId}] Unregistered grid layout: ${layoutId}`);
    },

    /**
     * エクスポートフォーマットを登録
     * @param {Object} format - フォーマット設定
     * @param {string} format.id - フォーマットID
     * @param {string} format.name - 表示名
     * @param {string} [format.description] - 説明
     * @param {function} format.generate - 生成関数 (logs, boardData) => string
     */
    registerExportFormat(format) {
      if (!format.id || !format.name || typeof format.generate !== 'function') {
        console.error(`[Plugin:${pluginId}] Invalid export format:`, format);
        return;
      }
      const fullId = `${pluginId}:${format.id}`;
      registeredExportFormats.set(fullId, {
        ...format,
        id: fullId,
        pluginId,
      });
      console.log(`[Plugin:${pluginId}] Registered export format: ${format.name}`);
    },

    /**
     * エクスポートフォーマットを登録解除
     * @param {string} formatId - フォーマットID
     */
    unregisterExportFormat(formatId) {
      const fullId = `${pluginId}:${formatId}`;
      registeredExportFormats.delete(fullId);
      console.log(`[Plugin:${pluginId}] Unregistered export format: ${formatId}`);
    },

    /**
     * カードアクションを登録
     * @param {Object} action - アクション設定
     * @param {string} action.id - アクションID
     * @param {string} action.label - ボタンラベル（短いテキストまたは絵文字）
     * @param {string} [action.title] - ツールチップ
     * @param {string} action.position - 表示位置: 'task' | 'card-header' | 'card-footer'
     * @param {function} action.handler - クリック時のハンドラ (cardId, cardData, taskIndex?) => any
     */
    registerCardAction(action) {
      if (!action.id || !action.label || !action.position || typeof action.handler !== 'function') {
        console.error(`[Plugin:${pluginId}] Invalid card action:`, action);
        return;
      }
      const fullId = `${pluginId}:${action.id}`;
      registeredCardActions.set(fullId, {
        ...action,
        id: fullId,
        pluginId,
      });
      console.log(`[Plugin:${pluginId}] Registered card action: ${action.label} (${action.position})`);
    },

    /**
     * カードアクションを登録解除
     * @param {string} actionId - アクションID
     */
    unregisterCardAction(actionId) {
      const fullId = `${pluginId}:${actionId}`;
      registeredCardActions.delete(fullId);
      console.log(`[Plugin:${pluginId}] Unregistered card action: ${actionId}`);
    },

    /**
     * プラグイン設定を取得
     * @returns {Object} 設定オブジェクト
     */
    getSettings() {
      return getSettings(pluginId);
    },

    /**
     * プラグイン設定を保存
     * @param {Object} settings - 設定オブジェクト
     */
    saveSettings(settings) {
      return saveSettings(pluginId, settings);
    },

    /**
     * ログ出力
     * @param {...any} args - ログ引数
     */
    log(...args) {
      console.log(`[Plugin:${pluginId}]`, ...args);
    },

    /**
     * エラーログ出力
     * @param {...any} args - ログ引数
     */
    error(...args) {
      console.error(`[Plugin:${pluginId}]`, ...args);
    },
  };
}

/**
 * 登録済みのグリッドレイアウトを全て取得
 * @returns {Array} グリッドレイアウトの配列
 */
function getRegisteredGridLayouts() {
  return Array.from(registeredGridLayouts.values());
}

/**
 * プラグインのグリッドレイアウトを全て削除
 * @param {string} pluginId - プラグインID
 */
function clearPluginGridLayouts(pluginId) {
  for (const [key, layout] of registeredGridLayouts) {
    if (layout.pluginId === pluginId) {
      registeredGridLayouts.delete(key);
    }
  }
}

/**
 * 登録済みのエクスポートフォーマットを全て取得（メタデータのみ）
 * @returns {Array} エクスポートフォーマットの配列（generate関数を除く）
 */
function getRegisteredExportFormats() {
  return Array.from(registeredExportFormats.values()).map(({ generate, ...info }) => info);
}

/**
 * IDでエクスポートフォーマットを取得
 * @param {string} formatId - フォーマットID
 * @returns {Object|undefined} エクスポートフォーマット（generate関数を含む）
 */
function getExportFormatById(formatId) {
  return registeredExportFormats.get(formatId);
}

/**
 * プラグインのエクスポートフォーマットを全て削除
 * @param {string} pluginId - プラグインID
 */
function clearPluginExportFormats(pluginId) {
  for (const [key, format] of registeredExportFormats) {
    if (format.pluginId === pluginId) {
      registeredExportFormats.delete(key);
    }
  }
}

/**
 * 登録済みのカードアクションを全て取得（メタデータのみ）
 * @returns {Array} カードアクションの配列（handler関数を除く）
 */
function getRegisteredCardActions() {
  return Array.from(registeredCardActions.values()).map(({ handler, ...info }) => info);
}

/**
 * IDでカードアクションを取得
 * @param {string} actionId - アクションID
 * @returns {Object|undefined} カードアクション（handler関数を含む）
 */
function getCardActionById(actionId) {
  return registeredCardActions.get(actionId);
}

/**
 * プラグインのカードアクションを全て削除
 * @param {string} pluginId - プラグインID
 */
function clearPluginCardActions(pluginId) {
  for (const [key, action] of registeredCardActions) {
    if (action.pluginId === pluginId) {
      registeredCardActions.delete(key);
    }
  }
}

module.exports = {
  createPluginAPI,
  getRegisteredGridLayouts,
  clearPluginGridLayouts,
  getRegisteredExportFormats,
  getExportFormatById,
  clearPluginExportFormats,
  getRegisteredCardActions,
  getCardActionById,
  clearPluginCardActions,
};
