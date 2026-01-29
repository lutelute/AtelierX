import { useState, useEffect, useRef } from 'react';

/**
 * デバウンス付きlocalStorageフック
 * state変更後、一定時間（デフォルト300ms）後にまとめて書き込む
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef(storedValue);
  latestValueRef.current = storedValue;

  // デバウンス付き書き込み（300ms）
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(latestValueRef.current));
      } catch (error) {
        console.error('Error writing to localStorage:', error);
      }
    }, 300);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [key, storedValue]);

  // アンマウント時・ページ離脱時に即座に書き込み（データ損失防止）
  useEffect(() => {
    const flushSync = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      try {
        window.localStorage.setItem(key, JSON.stringify(latestValueRef.current));
      } catch (error) {
        console.error('Error flushing to localStorage:', error);
      }
    };

    window.addEventListener('beforeunload', flushSync);
    return () => {
      window.removeEventListener('beforeunload', flushSync);
      flushSync();
    };
  }, [key]);

  return [storedValue, setStoredValue];
}
