import { useState } from 'react';
import { Settings } from '../types';
import { BasicSettings } from './settings/BasicSettings';
import { AppTabsManager } from './settings/AppTabsManager';
import { SubtagManager } from './settings/SubtagManager';
import { ObsidianIntegration } from './settings/ObsidianIntegration';
import { BackupSection } from './settings/BackupSection';
import { PluginManager } from './settings/PluginManager';
import { VersionChecker } from './settings/VersionChecker';

export { type Settings };

type SettingsTab = 'general' | 'plugins';
type GeneralSubTab = 'basic' | 'content' | 'integration';

interface SettingsModalProps {
  onClose: () => void;
  onSave: (settings: Settings) => void;
  initialSettings: Settings;
  onExportBackup?: () => void;
  onImportBackup?: () => void;
  lastBackupTime?: number;
}

export const defaultSettings: Settings = {
  obsidianVaultPath: '',
  dailyNotePath: 'Daily Notes/{{date}}.md',
  insertMarker: '## AtelierX',
  cardClickBehavior: 'edit',
  customSubtags: [],
  theme: 'dark',
};

export function SettingsModal({ onClose, onSave, initialSettings, onExportBackup, onImportBackup, lastBackupTime }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [generalSubTab, setGeneralSubTab] = useState<GeneralSubTab>('basic');

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const onSettingsChange = (updater: (prev: Settings) => Settings) => {
    setSettings(updater);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>設定</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            一般
          </button>
          <button
            className={`settings-tab ${activeTab === 'plugins' ? 'active' : ''}`}
            onClick={() => setActiveTab('plugins')}
          >
            プラグイン
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'general' && (
            <>
              <div className="settings-subtabs">
                <button className={`settings-subtab ${generalSubTab === 'basic' ? 'active' : ''}`} onClick={() => setGeneralSubTab('basic')}>基本設定</button>
                <button className={`settings-subtab ${generalSubTab === 'content' ? 'active' : ''}`} onClick={() => setGeneralSubTab('content')}>コンテンツ管理</button>
                <button className={`settings-subtab ${generalSubTab === 'integration' ? 'active' : ''}`} onClick={() => setGeneralSubTab('integration')}>連携・データ</button>
              </div>

              {generalSubTab === 'basic' && (
                <BasicSettings settings={settings} onSettingsChange={onSettingsChange} />
              )}

              {generalSubTab === 'content' && (
                <>
                  <AppTabsManager settings={settings} onSettingsChange={onSettingsChange} />
                  <SubtagManager settings={settings} onSettingsChange={onSettingsChange} />
                </>
              )}

              {generalSubTab === 'integration' && (
                <>
                  <ObsidianIntegration settings={settings} onSettingsChange={onSettingsChange} />
                  <BackupSection lastBackupTime={lastBackupTime} onExportBackup={onExportBackup} onImportBackup={onImportBackup} />
                </>
              )}
            </>
          )}

          {activeTab === 'plugins' && <PluginManager />}
        </div>

        <VersionChecker />

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>キャンセル</button>
          <button type="button" className="btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
