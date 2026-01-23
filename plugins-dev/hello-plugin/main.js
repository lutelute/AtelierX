/**
 * Hello Plugin - テスト用プラグイン
 */

module.exports = {
  onload(api) {
    api.log('Hello! プラグインが読み込まれました');

    // シンプルなグリッドレイアウトを追加
    api.registerGridLayout({
      id: 'hello-dual',
      name: 'Hello 2分割',
      description: 'テスト用: 左右2分割',
      cols: 2,
      rows: 1,
      padding: 10
    });

    api.registerGridLayout({
      id: 'hello-quad',
      name: 'Hello 4分割',
      description: 'テスト用: 2x2グリッド',
      cols: 2,
      rows: 2,
      padding: 8
    });

    api.log('2つのレイアウトを登録しました');
  },

  onunload() {
    console.log('Hello Plugin: さようなら！');
  }
};
