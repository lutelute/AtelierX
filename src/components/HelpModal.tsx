import { useState } from 'react';

interface HelpModalProps {
  onClose: () => void;
}

type HelpTab = 'overview' | 'features' | 'plugins' | 'shortcuts';

export function HelpModal({ onClose }: HelpModalProps) {
  const [activeTab, setActiveTab] = useState<HelpTab>('overview');

  const tabs: { id: HelpTab; label: string }[] = [
    { id: 'overview', label: '概要' },
    { id: 'features', label: '機能一覧' },
    { id: 'plugins', label: 'プラグイン' },
    { id: 'shortcuts', label: 'ショートカット' },
  ];

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
                <h3>AtelierX <span className="help-version">v1.6.0</span></h3>
                <p>ウィンドウをカンバンボードで管理し、作業状況を可視化するデスクトップアプリです。</p>
              </div>
              <div className="help-feature-grid">
                <div className="help-feature-card">
                  <div className="help-feature-icon">📋</div>
                  <div className="help-feature-title">カンバンボード</div>
                  <div className="help-feature-desc">ウィンドウをカードとして管理。ドラッグ&ドロップで状態を更新。</div>
                </div>
                <div className="help-feature-card">
                  <div className="help-feature-icon">🖥️</div>
                  <div className="help-feature-title">ウィンドウ管理</div>
                  <div className="help-feature-desc">カードクリックでウィンドウにジャンプ。開閉状態をリアルタイム追跡。</div>
                </div>
                <div className="help-feature-card">
                  <div className="help-feature-icon">⊞</div>
                  <div className="help-feature-title">Grid配置</div>
                  <div className="help-feature-desc">ウィンドウをグリッド状に自動整列。マルチアプリ対応。</div>
                </div>
                <div className="help-feature-card">
                  <div className="help-feature-icon">📄</div>
                  <div className="help-feature-title">日報エクスポート</div>
                  <div className="help-feature-desc">作業内容をMarkdown/JSON/Textで出力。Obsidian連携対応。</div>
                </div>
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
              </div>
              <div className="help-feature-detail">
                <h4>Terminal色変更</h4>
                <p>Terminalウィンドウの背景色をカラム色・優先順位色・グラデーション・プリセットで一括変更できます。</p>
                <div className="mg-help-note">
                  <b>注意:</b> この機能はmacOS専用です。Windows/Linuxでは使用できません。
                </div>
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
      </div>
    </div>
  );
}
