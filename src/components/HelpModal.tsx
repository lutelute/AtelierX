import { useState } from 'react';

interface HelpModalProps {
  onClose: () => void;
}

type HelpTab = 'overview' | 'features' | 'plugins' | 'shortcuts';

interface FeatureInfo {
  id: string;
  icon: string;
  title: string;
  desc: string;
  gif?: string;
}

const FEATURES: FeatureInfo[] = [
  { id: 'kanban', icon: '📋', title: 'カンバンボード', desc: 'ウィンドウをカードとして管理。ドラッグ&ドロップで状態を更新。', gif: './help/demo-dnd.gif' },
  { id: 'window', icon: '🖥️', title: 'ウィンドウ管理', desc: 'カードクリックでウィンドウにジャンプ。開閉状態をリアルタイム追跡。', gif: './help/demo-jump.gif' },
  { id: 'grid', icon: '⊞', title: 'Grid配置', desc: 'ウィンドウをグリッド状に自動整列。マルチアプリ対応。', gif: './help/demo-grid.gif' },
  { id: 'multi', icon: '🔗', title: 'マルチウィンドウ', desc: '1枚のカードに複数ウィンドウを紐づけてまとめて管理。' },
  { id: 'export', icon: '📄', title: '日報エクスポート', desc: '作業内容をMarkdown/JSON/Textで出力。Obsidian連携対応。' },
  { id: 'timer', icon: '⏱', title: 'タイマー & パルス', desc: 'タスクにタイマーを設定。実行中はカラム色でカードがパルス発光。', gif: './help/demo-timer-pulse.gif' },
  { id: 'color', icon: '🎨', title: 'Terminal色変更', desc: 'カラム色・プリセット・カスタムカラーでTerminal背景色を一括変更。', gif: './help/demo-terminal-color.gif' },
];

export function HelpModal({ onClose }: HelpModalProps) {
  const [activeTab, setActiveTab] = useState<HelpTab>('overview');
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);

  const tabs: { id: HelpTab; label: string }[] = [
    { id: 'overview', label: '概要' },
    { id: 'features', label: '機能一覧' },
    { id: 'plugins', label: 'プラグイン' },
    { id: 'shortcuts', label: 'ショートカット' },
  ];

  const selectedFeature = FEATURES.find(f => f.id === selectedDemo);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>ヘルプ</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="help-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`help-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="help-content">
          {activeTab === 'overview' && (
            <div className="help-tab-content">
              <div className="help-intro">
                <h3>AtelierX <span className="help-version">v{__APP_VERSION__}</span></h3>
                <p>ウィンドウをカンバンボードで管理し、作業状況を可視化するデスクトップアプリです。</p>
              </div>
              <div className="help-feature-grid">
                {FEATURES.map((f) => (
                  <div
                    key={f.id}
                    className={`help-feature-card ${f.gif ? 'has-demo' : ''} ${selectedDemo === f.id ? 'active' : ''}`}
                    onClick={() => f.gif && setSelectedDemo(selectedDemo === f.id ? null : f.id)}
                  >
                    <div className="help-feature-icon">{f.icon}</div>
                    <div className="help-feature-title">
                      {f.title}
                      {f.gif && <span className="help-demo-badge">DEMO</span>}
                    </div>
                    <div className="help-feature-desc">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'features' && (
            <div className="help-tab-content">
              <div className="help-feature-detail">
                <h4>Grid配置</h4>
                <p>選択したアプリのウィンドウをディスプレイ上にグリッド状に配置します。</p>
                <ul>
                  <li><b>単一アプリGrid:</b> 現在のタブのアプリのウィンドウのみを対象に配置</li>
                  <li><b>マルチアプリGrid:</b> 複数のアプリのウィンドウを画面分割で同時配置</li>
                </ul>
                <div className="mg-help-note">
                  <b>注意:</b> macOSの「ステージマネージャー」が有効な場合、Grid配置が正しく動作しないことがあります。システム設定 → デスクトップとDock → ステージマネージャー を<b>オフ</b>にしてください。
                </div>
                <div className="mg-help-note">
                  <b>権限トラブル:</b> Grid配置が動作しない場合、システム設定 → アクセシビリティ で AtelierX を左下の「−」で<b>一度削除</b>してから「+」で再追加してください（オフ→オンの切替だけでは不十分な場合があります）。
                </div>
              </div>
              <div className="help-feature-detail">
                <h4>Terminal色変更</h4>
                <p>Terminalウィンドウの背景色をカラム色・優先順位色・グラデーション・プリセットで一括変更できます。</p>
                <ul>
                  <li><b>カラム色:</b> カラムに設定した色をTerminal背景に適用</li>
                  <li><b>プリセット:</b> Ocean / Forest / Sunset / Berry / Slate / Rose の6テーマ</li>
                  <li><b>カスタムカラー:</b> カラーピッカーで任意の色を選択</li>
                  <li><b>グラデーション:</b> 色相を均等分割したグラデーション</li>
                </ul>
                <div className="mg-help-note">
                  <b>注意:</b> この機能はmacOS専用です。Windows/Linuxでは使用できません。
                </div>
              </div>
              <div className="help-feature-detail">
                <h4>タイマー & パルス</h4>
                <p>タスクの右クリックメニューからタイマーを開始できます。</p>
                <ul>
                  <li><b>タイマー開始:</b> タスクの作業時間を自動記録</li>
                  <li><b>パルスアニメーション:</b> タイマー実行中のカードがカラム色でグロー発光</li>
                  <li><b>ステータス同期:</b> タイマー開始で自動的に[/]進行中に</li>
                </ul>
              </div>
              <div className="help-feature-detail">
                <h4>日報エクスポート</h4>
                <p>カンバンボードのカード情報を日報として出力します。</p>
                <ul>
                  <li>Markdown / JSON / Text の3フォーマット</li>
                  <li>タブ・状態でフィルター可能</li>
                  <li>Obsidian Vaultへの直接追記に対応</li>
                  <li>プラグインで独自フォーマットを追加可能</li>
                </ul>
              </div>
              <div className="help-feature-detail">
                <h4>マルチウィンドウカード</h4>
                <p>1枚のカードにTerminal / Finder など複数のウィンドウを紐づけて管理できます。</p>
                <ul>
                  <li><b>ウィンドウ追加:</b> カード編集画面から関連ウィンドウを追加</li>
                  <li><b>一括ジャンプ:</b> カードクリックで紐づけた全ウィンドウを前面に表示</li>
                  <li><b>個別操作:</b> 各ウィンドウを個別にジャンプ・削除可能</li>
                </ul>
              </div>
              <div className="help-feature-detail">
                <h4>データバックアップ</h4>
                <p>カンバンの全データをJSON形式で保存・復元できます。</p>
                <ul>
                  <li>JSON（.json）形式のみ対応</li>
                  <li>自動バックアップ: 1分ごとに自動保存 + ローテーション保護</li>
                  <li>手動エクスポート / インポートで任意のタイミングで保存・復元</li>
                  <li>保存時に前回データを <code className="help-code-inline">.prev.json</code> に自動退避</li>
                </ul>
              </div>
              <div className="help-feature-detail">
                <h4>プラグインシステム</h4>
                <p>GitHubリポジトリからプラグインをインストールして機能を拡張できます。</p>
                <ul>
                  <li>Grid配置プリセット</li>
                  <li>エクスポートフォーマット</li>
                  <li>カードアクション</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'plugins' && (
            <div className="help-tab-content">
              <div className="help-subsection">
                <h4>プラグインのインストール</h4>
                <div className="help-steps">
                  <div className="help-step">
                    <span className="help-step-num">1</span>
                    <span>設定画面を開く（サイドバーの歯車アイコン）</span>
                  </div>
                  <div className="help-step">
                    <span className="help-step-num">2</span>
                    <span>「プラグイン」タブを選択</span>
                  </div>
                  <div className="help-step">
                    <span className="help-step-num">3</span>
                    <span>GitHubリポジトリを <code className="help-code-inline">owner/repo</code> 形式で入力</span>
                  </div>
                  <div className="help-step">
                    <span className="help-step-num">4</span>
                    <span>「インストール」をクリック</span>
                  </div>
                </div>
              </div>
              <div className="help-subsection">
                <h4>プラグインを作成する</h4>
                <p>テンプレートリポジトリを使って独自プラグインを作成できます。</p>
                <div className="help-code-block">
                  <code>gh repo create my-plugin --template lutelute/AtelierX-plugin-template</code>
                </div>
              </div>
              <div className="help-subsection">
                <h4>プラグインタイプ</h4>
                <ul>
                  <li><b>grid-layout:</b> Grid配置のプリセットレイアウトを追加</li>
                  <li><b>export:</b> エクスポートフォーマットを追加</li>
                  <li><b>utility:</b> ユーティリティ機能を追加</li>
                  <li><b>integration:</b> 外部サービスとの連携</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="help-tab-content">
              <div className="help-subsection">
                <h4>基本操作</h4>
                <div className="help-shortcuts-grid">
                  <div className="help-shortcut-item">
                    <kbd>⌘ ,</kbd>
                    <span>設定を開く</span>
                  </div>
                  <div className="help-shortcut-item">
                    <kbd>⌘ W</kbd>
                    <span>ウィンドウを閉じる</span>
                  </div>
                  <div className="help-shortcut-item">
                    <kbd>Esc</kbd>
                    <span>モーダルを閉じる</span>
                  </div>
                  <div className="help-shortcut-item">
                    <kbd>⌘ Z</kbd>
                    <span>元に戻す</span>
                  </div>
                </div>
              </div>
              <div className="help-subsection">
                <h4>カード操作</h4>
                <div className="help-shortcuts-grid">
                  <div className="help-shortcut-item">
                    <span className="help-shortcut-action">クリック</span>
                    <span>ウィンドウにジャンプ / 編集（設定による）</span>
                  </div>
                  <div className="help-shortcut-item">
                    <span className="help-shortcut-action">ドラッグ</span>
                    <span>カードを移動（カラム間・カラム内）</span>
                  </div>
                  <div className="help-shortcut-item">
                    <kbd>Enter</kbd>
                    <span>編集モーダルで保存</span>
                  </div>
                  <div className="help-shortcut-item">
                    <kbd>Esc</kbd>
                    <span>編集をキャンセル</span>
                  </div>
                </div>
              </div>
              <div className="help-subsection">
                <h4>エディタ</h4>
                <div className="help-shortcuts-grid">
                  <div className="help-shortcut-item">
                    <kbd>Tab</kbd>
                    <span>インデント追加</span>
                  </div>
                  <div className="help-shortcut-item">
                    <kbd>Shift + Tab</kbd>
                    <span>インデント削除</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="help-footer">
          <a className="help-footer-link" href="https://github.com/lutelute/AtelierX" target="_blank" rel="noopener noreferrer">
            GitHub リポジトリ
          </a>
          <a className="help-footer-link" href="https://github.com/lutelute/AtelierX/issues" target="_blank" rel="noopener noreferrer">
            バグ報告・要望
          </a>
        </div>

        {selectedFeature?.gif && (
          <div className="help-demo-overlay" onClick={() => setSelectedDemo(null)}>
            <div className="help-demo-popup" onClick={(e) => e.stopPropagation()}>
              <div className="help-demo-popup-header">
                <span>{selectedFeature.icon} {selectedFeature.title}</span>
                <button className="help-demo-close" onClick={() => setSelectedDemo(null)}>×</button>
              </div>
              <img src={selectedFeature.gif} alt={selectedFeature.title} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
