/**
 * Plugin API - プラグインに提供するAPI
 *
 * プラグインの onload(api) で渡されるAPIオブジェクト
 */

// 登録されたグリッドレイアウト
const registeredGridLayouts = new Map();

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

module.exports = {
  createPluginAPI,
  getRegisteredGridLayouts,
  clearPluginGridLayouts,
};
