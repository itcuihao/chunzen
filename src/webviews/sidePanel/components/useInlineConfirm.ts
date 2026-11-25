import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 轻量内联二次点击确认 Hook（替代在 VS Code WebView 中被拦截的 window.confirm）。
 * 首次点击进入待确认态（默认 3 秒后自动重置），待确认期内再次点击才真正执行动作。
 */
export function useInlineConfirm(timeoutMs = 3000) {
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const trigger = useCallback(
    (key: string, action: () => void) => {
      if (confirmingKey === key) {
        clearTimer();
        setConfirmingKey(null);
        action();
        return;
      }
      clearTimer();
      setConfirmingKey(key);
      timerRef.current = window.setTimeout(() => {
        setConfirmingKey((curr) => (curr === key ? null : curr));
        timerRef.current = null;
      }, timeoutMs);
    },
    [confirmingKey, timeoutMs]
  );

  const isConfirming = useCallback(
    (key: string) => confirmingKey === key,
    [confirmingKey]
  );

  return { isConfirming, trigger };
}
