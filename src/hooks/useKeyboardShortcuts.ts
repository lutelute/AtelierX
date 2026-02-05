import { useEffect } from 'react';

interface UseKeyboardShortcutsParams {
  activeBoard: string;
  handleUndo: () => void;
  setShowSettingsModal: (show: boolean) => void;
  setShowGridModal: (show: boolean) => void;
  isModalOpen: boolean;
}

export function useKeyboardShortcuts({
  activeBoard,
  handleUndo,
  setShowSettingsModal,
  setShowGridModal,
  isModalOpen,
}: UseKeyboardShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) return;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + , で設定モーダルを開く
      if (mod && e.key === ',') {
        e.preventDefault();
        setShowSettingsModal(true);
        return;
      }

      // Ctrl + G でGrid配置モーダルを開く
      if (mod && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (activeBoard !== 'ideas') {
          setShowGridModal(true);
        }
        return;
      }

      // Cmd/Ctrl + Z でUndo
      if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeBoard, handleUndo, setShowSettingsModal, setShowGridModal, isModalOpen]);
}
