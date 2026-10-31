import { Icon } from '../../components/Icon';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TaskDto } from '@research/contracts';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { tasksText as t } from '../../locales/zh-CN';
import { ApiError } from '../../lib/api-client';
import { useResourceWrite, writeApi } from './task-api';
export function TaskActions({ task, userId, compact = false, onDeleted, onChanged, onRefresh, checkbox = false }: { checkbox?: boolean; task: TaskDto; userId: string; compact?: boolean; onDeleted?: () => void; onChanged?: () => void; onRefresh?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const toast = useToast(), client = useQueryClient();
  const action = useResourceWrite<{ action: 'complete' | 'reopen' | 'archive' | 'delete'; expectedVersion: number }, TaskDto>(userId,
    (input, key) => writeApi(`/tasks/${task.id}${input.action === 'delete' ? '' : `/${input.action}`}`, input.action === 'delete' ? 'DELETE' : 'POST', { expectedVersion: input.expectedVersion }, key),
    result => {
      if (result.deletedAt) {
        setConfirm(false);
        const restoreKey = crypto.randomUUID();
        toast(t.removed, { label: t.undo, success: t.restored, run: async () => {
          await writeApi(`/tasks/${result.id}/restore`, 'POST', { expectedVersion: result.version }, restoreKey);
          await Promise.all(['tasks', 'task', 'calendar'].map(resource => client.invalidateQueries({ queryKey: [resource, userId] })));
        } });
        onDeleted?.();
      } else { toast(result.archivedAt ? t.archiveDone : result.status === 'done' ? t.completed : t.reopened); onChanged?.(); }
    });
  const run = (name: 'complete' | 'reopen' | 'archive' | 'delete') => { if (!action.isPending) action.mutate({ action: name, expectedVersion: task.version }); };
  const terminal = task.status === 'done' || task.status === 'canceled';
  const error = action.isError && <p className="error" role="alert">{action.error.message} {action.error instanceof ApiError && action.error.status === 409 && onRefresh && <button type="button" onClick={onRefresh}>{t.refresh}</button>}</p>;
  return <div className={`task-actions${compact ? ' compact' : ''}`}>
    <div className="task-action-buttons"><button type="button" className={checkbox ? `task-complete-check${task.status === 'done' ? ' checked' : ''}` : undefined} role={checkbox ? 'checkbox' : undefined} aria-checked={checkbox ? task.status === 'done' : undefined} disabled={action.isPending} aria-label={`${terminal ? t.reopen : t.complete}：${task.title}`} onClick={() => run(terminal ? 'reopen' : 'complete')}>{checkbox ? task.status === 'done' ? <Icon name="check" /> : null : terminal ? t.reopen : t.complete}</button>
      {!compact && <>{terminal && !task.archivedAt && <button type="button" disabled={action.isPending} onClick={() => run('archive')}>{t.archive}</button>}<button type="button" className="danger" disabled={action.isPending} onClick={() => { action.reset(); setConfirm(true); }}>{t.remove}</button></>}
    </div>
    {!confirm && error}
    {confirm && <Dialog title={t.confirmRemove} onClose={() => { if (!action.isPending) setConfirm(false); }}><p className="confirm-task-title">{task.title}</p><p className="help">{t.removeHelp}</p>{error}<div className="dialog-actions"><button type="button" disabled={action.isPending} onClick={() => setConfirm(false)}>{t.cancel}</button><button type="button" className="danger" disabled={action.isPending} onClick={() => run('delete')}>{action.isPending ? t.removing : t.confirmRemove}</button></div></Dialog>}
  </div>;
}
