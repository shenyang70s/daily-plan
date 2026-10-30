import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { text } from '../locales/zh-CN';

const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((value: string) => {
    clearTimeout(timer.current);
    setMessage(value);
    timer.current = setTimeout(() => setMessage(''), 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <ToastContext.Provider value={show}>{children}
    <div className={`toast${message ? ' visible' : ''}`} role="status" aria-live="polite" aria-atomic="true">
      {message && <><span>{message}</span><button type="button" onClick={() => { clearTimeout(timer.current); setMessage(''); }}>{text.close}</button></>}
    </div>
  </ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
