import '@testing-library/jest-dom/vitest';
import { createMockElectronAPI } from './mocks/electronAPI';

// electronAPI のグローバルモック
Object.defineProperty(window, 'electronAPI', {
  value: createMockElectronAPI(),
  writable: true,
});
