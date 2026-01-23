/**
 * Sample Grid Layouts Plugin
 *
 * Window Board のプラグイン開発サンプル
 * グリッドレイアウトプリセットを追加します
 */

const layouts = [
  {
    id: 'dev-3col',
    name: '開発 3列',
    description: 'エディタ・ターミナル・ブラウザを横並び',
    cols: 3,
    rows: 1,
    padding: 5
  },
  {
    id: 'code-review',
    name: 'コードレビュー',
    description: '3列2行の6分割レイアウト',
    cols: 3,
    rows: 2,
    padding: 8
  },
  {
    id: 'presentation',
    name: 'プレゼンテーション',
    description: '2つのウィンドウを横並び',
    cols: 2,
    rows: 1,
    padding: 10
  },
  {
    id: 'focus',
    name: 'フォーカス',
    description: '大きなメインウィンドウ1つ',
    cols: 1,
    rows: 1,
    padding: 20
  },
  {
    id: 'quad',
    name: '4分割',
    description: '2x2 の4分割グリッド',
    cols: 2,
    rows: 2,
    padding: 5
  }
];

module.exports = {
  /**
   * プラグインが有効化されたときに呼ばれる
   * @param {Object} api - プラグインAPI
   */
  onload(api) {
    api.log('Sample Grid Layouts plugin loading...');

    // 全てのレイアウトを登録
    layouts.forEach(layout => {
      api.registerGridLayout(layout);
    });

    api.log(`Registered ${layouts.length} grid layouts`);

    // 設定の読み込み/初期化
    const settings = api.getSettings();
    if (!settings.loadCount) {
      api.saveSettings({ loadCount: 1, firstLoadedAt: Date.now() });
    } else {
      api.saveSettings({ ...settings, loadCount: settings.loadCount + 1 });
    }
  },

  /**
   * プラグインが無効化されたときに呼ばれる
   */
  onunload() {
    console.log('Sample Grid Layouts plugin unloaded');
    // 登録したグリッドレイアウトは自動的に削除される
  }
};
