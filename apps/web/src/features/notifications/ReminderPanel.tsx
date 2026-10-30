import { lazy, Suspense } from 'react';
import type { ComponentProps } from 'react';
import type { ReminderEditor } from './ReminderEditor';
const Editor = lazy(() => import('./ReminderEditor').then(module => ({ default: module.ReminderEditor })));
export function ReminderPanel(props: ComponentProps<typeof ReminderEditor>) {
  return <Suspense fallback={<p role="status">正在加载提醒…</p>}><Editor {...props} /></Suspense>;
}
