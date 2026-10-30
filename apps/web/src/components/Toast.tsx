import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { text } from '../locales/zh-CN';

interface ToastAction { label: string; success: string; run: () => Promise<void> }
const ToastContext = createContext<(message: string, action?: ToastAction) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<ToastAction | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((value: string, nextAction?: ToastAction) => {
    clearTimeout(timer.current);
    setMessage(value);
    setAction(nextAction);
    timer.current = setTimeout(() => { setMessage(''); setAction(undefined); }, nextAction ? 10000 : 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <ToastContext.Provider value={show}>{children}
    <div className={`toast${message ? ' visible' : ''}`} role="status" aria-live="polite" aria-atomic="true">
      {message && <><span>{message}</span>{action && <button type="button" disabled={working} onClick={async () => {
        if (working) return;
        clearTimeout(timer.current); setWorking(true);
        try { await action.run(); show(action.success); }
        catch (error) { setMessage(error instanceof Error ? error.message : text.requestFailed); }
        finally { setWorking(false); }
      }}>{action.label}</button>}<button type="button" disabled={working} onClick={() => { clearTimeout(timer.current); setMessage(''); setAction(undefined); }}>{text.close}</button></>}
    </div>
  </ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
