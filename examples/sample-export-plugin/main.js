/**
 * Sample Export Formats Plugin
 *
 * AtelierX のプラグイン開発サンプル
 * エクスポートフォーマットを追加します
 */

const exportFormats = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Slack投稿用フォーマット',
    generate(logs, boardData) {
      const date = new Date().toLocaleDateString('ja-JP');
      const lines = [
        `:calendar: *日報 ${date}*`,
        '',
        ':clipboard: *今日の活動:*'
      ];

      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit'
        });
        lines.push(`• \`${time}\` ${log.text}`);
      });

      if (boardData && boardData.items && boardData.items.length > 0) {
        lines.push('');
        lines.push(':pushpin: *ボード項目:*');
        boardData.items.forEach(item => {
          lines.push(`• ${item.text}`);
        });
      }

      return lines.join('\n');
    }
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Notionデータベース用JSON',
    generate(logs, boardData) {
      const date = new Date().toISOString().split('T')[0];
      const data = {
        parent: { database_id: 'YOUR_DATABASE_ID' },
        properties: {
          Name: {
            title: [{ text: { content: `日報 ${date}` } }]
          },
          Date: {
            date: { start: date }
          }
        },
        children: logs.map(log => ({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{
              type: 'text',
              text: {
                content: `${new Date(log.timestamp).toLocaleTimeString('ja-JP', {
                  hour: '2-digit',
                  minute: '2-digit'
                })} - ${log.text}`
              }
            }]
          }
        }))
      };

      return JSON.stringify(data, null, 2);
    }
  },
  {
    id: 'html',
    name: 'HTML',
    description: 'HTML形式でエクスポート',
    generate(logs, boardData) {
      const date = new Date().toLocaleDateString('ja-JP');
      const lines = [
        '<!DOCTYPE html>',
        '<html lang="ja">',
        '<head>',
        '  <meta charset="UTF-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        `  <title>日報 ${date}</title>`,
        '  <style>',
        '    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }',
        '    h1 { color: #333; }',
        '    ul { list-style-type: none; padding: 0; }',
        '    li { padding: 8px 0; border-bottom: 1px solid #eee; }',
        '    .time { color: #666; font-size: 0.9em; margin-right: 8px; }',
        '  </style>',
        '</head>',
        '<body>',
        `  <h1>日報 ${date}</h1>`,
        '  <h2>活動ログ</h2>',
        '  <ul>'
      ];

      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit'
        });
        lines.push(`    <li><span class="time">${time}</span>${escapeHtml(log.text)}</li>`);
      });

      lines.push('  </ul>');

      if (boardData && boardData.items && boardData.items.length > 0) {
        lines.push('  <h2>ボード項目</h2>');
        lines.push('  <ul>');
        boardData.items.forEach(item => {
          lines.push(`    <li>${escapeHtml(item.text)}</li>`);
        });
        lines.push('  </ul>');
      }

      lines.push('</body>');
      lines.push('</html>');

      return lines.join('\n');
    }
  }
];

/**
 * HTMLエスケープ関数
 * @param {string} text - エスケープするテキスト
 * @returns {string} エスケープされたテキスト
 */
function escapeHtml(text) {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, char => escapeMap[char]);
}

module.exports = {
  /**
   * プラグインが有効化されたときに呼ばれる
   * @param {Object} api - プラグインAPI
   */
  onload(api) {
    api.log('Sample Export Formats plugin loading...');

    // 全てのエクスポートフォーマットを登録
    exportFormats.forEach(format => {
      api.registerExportFormat(format);
    });

    api.log(`Registered ${exportFormats.length} export formats`);

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
    // 登録したエクスポートフォーマットは自動的に削除される
  }
};
