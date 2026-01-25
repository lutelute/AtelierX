/**
 * Plugin Manager - プラグイン管理モジュール
 *
 * プラグインのインストール、有効化/無効化、アンインストールを管理
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { app } = require('electron');
const { createPluginAPI, clearPluginGridLayouts, clearPluginExportFormats } = require('./pluginAPI.cjs');

// ロード済みプラグインのインスタンス
const loadedPlugins = new Map();

// =====================================================
// パス管理
// =====================================================

/**
 * プラグインディレクトリのパスを取得
 */
function getPluginsPath() {
  return path.join(app.getPath('userData'), 'plugins');
}

/**
 * プラグインレジストリのパスを取得
 */
function getRegistryPath() {
  return path.join(getPluginsPath(), 'plugins.json');
}

/**
 * プラグインディレクトリのパスを取得
 * @param {string} pluginId - プラグインID
 */
function getPluginPath(pluginId) {
  return path.join(getPluginsPath(), pluginId);
}

// =====================================================
// レジストリ管理
// =====================================================

/**
 * プラグインディレクトリを初期化
 */
function ensurePluginsDir() {
  const pluginsPath = getPluginsPath();
  if (!fs.existsSync(pluginsPath)) {
    fs.mkdirSync(pluginsPath, { recursive: true });
  }
}

/**
 * プラグインレジストリを読み込み
 */
function loadRegistry() {
  ensurePluginsDir();
  const registryPath = getRegistryPath();
  if (!fs.existsSync(registryPath)) {
    return { version: 1, plugins: {} };
  }
  try {
    const content = fs.readFileSync(registryPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to load plugin registry:', error);
    return { version: 1, plugins: {} };
  }
}

/**
 * プラグインレジストリを保存
 * @param {Object} registry - レジストリオブジェクト
 */
function saveRegistry(registry) {
  ensurePluginsDir();
  const registryPath = getRegistryPath();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

// =====================================================
// プラグイン一覧
// =====================================================

/**
 * インストール済みプラグイン一覧を取得
 */
function getInstalledPlugins() {
  const registry = loadRegistry();
  const plugins = [];

  for (const [pluginId, state] of Object.entries(registry.plugins)) {
    const pluginPath = getPluginPath(pluginId);
    const manifestPath = path.join(pluginPath, 'manifest.json');

    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        plugins.push({ manifest, state });
      } catch (error) {
        console.error(`Failed to load manifest for ${pluginId}:`, error);
      }
    }
  }

  return plugins;
}

// =====================================================
// プラグイン設定
// =====================================================

/**
 * プラグイン設定を取得
 * @param {string} pluginId - プラグインID
 */
function getPluginSettings(pluginId) {
  const registry = loadRegistry();
  return registry.plugins[pluginId]?.settings || {};
}

/**
 * プラグイン設定を保存
 * @param {string} pluginId - プラグインID
 * @param {Object} settings - 設定オブジェクト
 */
function savePluginSettings(pluginId, settings) {
  const registry = loadRegistry();
  if (registry.plugins[pluginId]) {
    registry.plugins[pluginId].settings = settings;
    registry.plugins[pluginId].updatedAt = Date.now();
    saveRegistry(registry);
    return { success: true };
  }
  return { success: false, error: 'Plugin not found' };
}

// =====================================================
// プラグインインストール
// =====================================================

/**
 * GitHubからファイルをダウンロード
 * @param {string} url - ダウンロードURL
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'WindowBoard-PluginManager' } }, (response) => {
      // リダイレクトを処理
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(data));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * GitHubリポジトリパスを正規化
 * @param {string} input - リポジトリパスまたはURL
 * @returns {{ owner: string, repo: string } | null}
 */
function parseGitHubRepo(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // フルURL形式: https://github.com/owner/repo または https://github.com/owner/repo.git
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?(?:\/.*)?$/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // github.com/owner/repo 形式（httpsなし）
  const noProtocolMatch = trimmed.match(/^github\.com\/([^/]+)\/([^/.]+)(?:\.git)?(?:\/.*)?$/);
  if (noProtocolMatch) {
    return { owner: noProtocolMatch[1], repo: noProtocolMatch[2] };
  }

  // owner/repo 形式
  const simpleMatch = trimmed.match(/^([^/]+)\/([^/]+)$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], repo: simpleMatch[2] };
  }

  return null;
}

/**
 * GitHubからプラグインをインストール
 * @param {string} repoPath - リポジトリパス（owner/repo 形式またはGitHub URL）
 */
async function installFromGitHub(repoPath) {
  try {
    // repoPath の検証（owner/repo 形式またはURL）
    const parsed = parseGitHubRepo(repoPath);
    if (!parsed) {
      return { success: false, error: 'Invalid repository path. Use "owner/repo" or GitHub URL format.' };
    }

    const { owner, repo } = parsed;

    // manifest.json を取得
    const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/manifest.json`;
    let manifestContent;
    try {
      manifestContent = await downloadFile(manifestUrl);
    } catch (error) {
      // main ブランチがない場合は master を試す
      const masterUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/manifest.json`;
      manifestContent = await downloadFile(masterUrl);
    }

    const manifest = JSON.parse(manifestContent);

    // manifest の検証
    if (!manifest.id || !manifest.name || !manifest.version) {
      return { success: false, error: 'Invalid manifest: missing required fields (id, name, version)' };
    }

    // プラグインディレクトリを作成
    const pluginPath = getPluginPath(manifest.id);
    if (fs.existsSync(pluginPath)) {
      // 既存のプラグインを削除（更新）
      fs.rmSync(pluginPath, { recursive: true });
    }
    fs.mkdirSync(pluginPath, { recursive: true });

    // manifest.json を保存
    fs.writeFileSync(
      path.join(pluginPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    // main.js をダウンロード（存在する場合）
    const mainFile = manifest.main || 'main.js';
    try {
      let mainUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${mainFile}`;
      let mainContent;
      try {
        mainContent = await downloadFile(mainUrl);
      } catch {
        mainUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/${mainFile}`;
        mainContent = await downloadFile(mainUrl);
      }
      fs.writeFileSync(path.join(pluginPath, mainFile), mainContent, 'utf-8');
    } catch (error) {
      console.log(`No ${mainFile} found for plugin ${manifest.id}`);
    }

    // レジストリに登録
    const registry = loadRegistry();
    registry.plugins[manifest.id] = {
      enabled: false,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      settings: {},
    };
    saveRegistry(registry);

    console.log(`Plugin installed: ${manifest.name} (${manifest.id})`);
    return { success: true, data: { pluginId: manifest.id, manifest } };
  } catch (error) {
    console.error('Plugin installation failed:', error);
    return { success: false, error: error.message };
  }
}

// =====================================================
// プラグインのロード/アンロード
// =====================================================

/**
 * プラグインをロード
 * @param {string} pluginId - プラグインID
 */
function loadPlugin(pluginId) {
  const pluginPath = getPluginPath(pluginId);
  const manifestPath = path.join(pluginPath, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return { success: false, error: 'Plugin not found' };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const mainFile = manifest.main || 'main.js';
    const mainPath = path.join(pluginPath, mainFile);

    if (fs.existsSync(mainPath)) {
      // キャッシュをクリア
      delete require.cache[require.resolve(mainPath)];

      // プラグインをロード
      const plugin = require(mainPath);

      // APIを作成
      const api = createPluginAPI(pluginId, getPluginSettings, savePluginSettings);

      // onload を呼び出し
      if (typeof plugin.onload === 'function') {
        plugin.onload(api);
      }

      // ロード済みプラグインとして登録
      loadedPlugins.set(pluginId, { plugin, api });
      console.log(`Plugin loaded: ${manifest.name}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to load plugin ${pluginId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * プラグインをアンロード
 * @param {string} pluginId - プラグインID
 */
function unloadPlugin(pluginId) {
  const loaded = loadedPlugins.get(pluginId);

  if (loaded) {
    try {
      // onunload を呼び出し
      if (typeof loaded.plugin.onunload === 'function') {
        loaded.plugin.onunload();
      }
    } catch (error) {
      console.error(`Error in plugin ${pluginId} onunload:`, error);
    }

    // グリッドレイアウトをクリア
    clearPluginGridLayouts(pluginId);

    // エクスポートフォーマットをクリア
    clearPluginExportFormats(pluginId);

    // ロード済みリストから削除
    loadedPlugins.delete(pluginId);
    console.log(`Plugin unloaded: ${pluginId}`);
  }

  return { success: true };
}

// =====================================================
// プラグイン有効化/無効化
// =====================================================

/**
 * プラグインを有効化
 * @param {string} pluginId - プラグインID
 */
function enablePlugin(pluginId) {
  const registry = loadRegistry();

  if (!registry.plugins[pluginId]) {
    return { success: false, error: 'Plugin not found in registry' };
  }

  // プラグインをロード
  const result = loadPlugin(pluginId);
  if (!result.success) {
    return result;
  }

  // レジストリを更新
  registry.plugins[pluginId].enabled = true;
  registry.plugins[pluginId].updatedAt = Date.now();
  saveRegistry(registry);

  return { success: true };
}

/**
 * プラグインを無効化
 * @param {string} pluginId - プラグインID
 */
function disablePlugin(pluginId) {
  const registry = loadRegistry();

  if (!registry.plugins[pluginId]) {
    return { success: false, error: 'Plugin not found in registry' };
  }

  // プラグインをアンロード
  unloadPlugin(pluginId);

  // レジストリを更新
  registry.plugins[pluginId].enabled = false;
  registry.plugins[pluginId].updatedAt = Date.now();
  saveRegistry(registry);

  return { success: true };
}

// =====================================================
// プラグインアンインストール
// =====================================================

/**
 * プラグインをアンインストール
 * @param {string} pluginId - プラグインID
 */
function uninstallPlugin(pluginId) {
  // まず無効化
  disablePlugin(pluginId);

  // プラグインディレクトリを削除
  const pluginPath = getPluginPath(pluginId);
  if (fs.existsSync(pluginPath)) {
    fs.rmSync(pluginPath, { recursive: true });
  }

  // レジストリから削除
  const registry = loadRegistry();
  delete registry.plugins[pluginId];
  saveRegistry(registry);

  console.log(`Plugin uninstalled: ${pluginId}`);
  return { success: true };
}

// =====================================================
// 起動時の初期化
// =====================================================

/**
 * 有効なプラグインを全てロード
 */
function loadEnabledPlugins() {
  const registry = loadRegistry();

  for (const [pluginId, state] of Object.entries(registry.plugins)) {
    if (state.enabled) {
      loadPlugin(pluginId);
    }
  }
}

// =====================================================
// エクスポート
// =====================================================

module.exports = {
  getPluginsPath,
  getInstalledPlugins,
  getPluginSettings,
  savePluginSettings,
  installFromGitHub,
  enablePlugin,
  disablePlugin,
  uninstallPlugin,
  loadEnabledPlugins,
};
