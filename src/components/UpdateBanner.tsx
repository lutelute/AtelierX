import { useState, useEffect } from 'react';
import { UpdateCheckResult } from '../types';

const DISMISSED_KEY = 'dismissed-update-version';

interface UpdateBannerProps {
  onOpenSettings: () => void;
}

export function UpdateBanner({ onOpenSettings }: UpdateBannerProps) {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.update;
    if (!api?.onNotify) return;

    const cleanup = api.onNotify((data) => {
      if (!data.available || !data.version) return;

      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (dismissed === data.version) return;

      setUpdateInfo(data);
      // 少し遅らせてスライドインアニメーションを発火
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    });

    return cleanup;
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    if (updateInfo?.version) {
      localStorage.setItem(DISMISSED_KEY, updateInfo.version);
    }
    // アニメーション完了後に非表示
    setTimeout(() => setUpdateInfo(null), 300);
  };

  const handleUpdate = () => {
    onOpenSettings();
    handleDismiss();
  };

  if (!updateInfo) return null;

  return (
    <div className={`update-banner ${visible ? 'update-banner-visible' : ''}`}>
      <span className="update-banner-text">
        v{updateInfo.version} が利用可能です
      </span>
      <button className="update-banner-action" onClick={handleUpdate}>
        アップデート
      </button>
      <button className="update-banner-close" onClick={handleDismiss} title="閉じる">
        &times;
      </button>
    </div>
  );
}
