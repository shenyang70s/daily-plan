import { useState } from 'react';
import type { MilestoneDto } from '@research/contracts';
import { submissionText as t } from '../../locales/zh-CN';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { ApiError } from '../../lib/api-client';
import { DeadlineView, MilestoneSource } from './DeadlineView';
export function MilestoneList({ milestones, userId, timezone, now, archived, onEdit, onRefresh }: { milestones: MilestoneDto[]; userId: string; timezone: string; now: number; archived: boolean; onEdit: (id: string) => void; onRefresh: () => void }) {
  const [removing, setRemoving] = useState<MilestoneDto | null>(null), [accepted, setAccepted] = useState(false);
  const toast = useToast();
  const remove = useResourceWrite<{ id: string; expectedVersion: number; confirm: true }, unknown>(userId, (input, key) => writeApi(`/milestones/${input.id}`, 'DELETE', { expectedVersion: input.expectedVersion, confirm: input.confirm }, key), () => { setRemoving(null); setAccepted(false); toast(t.removed); });
  if (!milestones.length) return <EmptyState icon="submissions" title={t.noMilestones} description={t.noMilestonesHelp} />;
  return <>
    <div className="milestone-list">{milestones.map(milestone => <article className="milestone-card" key={milestone.id}><header><h3>{t.kinds[milestone.kind]}</h3>{!archived && <div><button type="button" aria-label={`${t.editMilestone}：${t.kinds[milestone.kind]}`} onClick={() => onEdit(milestone.id)}>{t.editMilestone}</button><button type="button" className="danger" aria-label={`${t.removeMilestone}：${t.kinds[milestone.kind]}`} onClick={() => { remove.reset(); setAccepted(false); setRemoving(milestone); }}>{t.removeMilestone}</button></div>}</header><DeadlineView milestone={milestone} timezone={timezone} now={now} /><MilestoneSource milestone={milestone} /></article>)}</div>
    {removing && <Dialog title={t.removeTitle} onClose={() => { if (!remove.isPending) setRemoving(null); }}><h3>{t.kinds[removing.kind]}</h3><DeadlineView milestone={removing} timezone={timezone} now={now} /><p className="help">{t.removeHelp}</p><label className="submission-checkbox"><input type="checkbox" disabled={remove.isPending} checked={accepted} onChange={event => setAccepted(event.target.checked)} />{t.confirmRemove}</label>{remove.isError && <p className="error" role="alert">{remove.error.message} {remove.error instanceof ApiError && remove.error.status === 409 && <button type="button" onClick={() => { setRemoving(null); onRefresh(); }}>{t.refresh}</button>}</p>}<div className="dialog-actions"><button type="button" disabled={remove.isPending} onClick={() => setRemoving(null)}>{t.cancel}</button><button type="button" className="danger" disabled={!accepted || remove.isPending} onClick={() => remove.mutate({ id: removing.id, expectedVersion: removing.version, confirm: true })}>{t.removeConfirm}</button></div></Dialog>}
  </>;
}
