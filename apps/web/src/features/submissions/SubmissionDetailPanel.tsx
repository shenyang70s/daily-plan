import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SubmissionDto } from '@research/contracts';
import { nextMilestone } from '@research/domain';
import { apiRequest, ApiError } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { Link, navigate } from '../../app/router';
import { submissionText as t, conferenceText } from '../../locales/zh-CN';
import { EmptyState } from '../../components/EmptyState';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { DeadlineView, useNow } from './DeadlineView';
import { SubmissionEditor } from './SubmissionEditor';
import { MilestoneEditor } from './MilestoneEditor';
import { MilestoneList } from './MilestoneList';
export function SubmissionDetailPanel({ id, userId, timezone }: { id: string; userId: string; timezone: string }) {
  const detail = useQuery({ queryKey: resourceKey('submission', userId, { id }), queryFn: ({ signal }) => apiRequest<SubmissionDto>(`/submissions/${encodeURIComponent(id)}`, { signal }) });
  const [editing, setEditing] = useState<string | null>(null), [revision, setRevision] = useState(0), [metaRevision, setMetaRevision] = useState(0), [archiveOpen, setArchiveOpen] = useState(false);
  const now = useNow(), toast = useToast();
  const archive = useResourceWrite<{ expectedVersion: number; restore: boolean }, SubmissionDto>(userId, (input, key) => writeApi(`/submissions/${id}${input.restore ? '/restore' : ''}`, input.restore ? 'POST' : 'DELETE', { expectedVersion: input.expectedVersion }, key), result => { setArchiveOpen(false); toast(result.archivedAt ? t.archivedDone : t.restored); if (result.archivedAt) navigate('/submissions'); else setMetaRevision(value => value + 1); });
  const refresh = async () => { const result = await detail.refetch(); if (result.isSuccess) { setRevision(value => value + 1); setMetaRevision(value => value + 1); } };
  if (detail.isPending) return <p role="status">{t.loading}</p>;
  if (!detail.data) return <><Link className="back-link" href="/submissions">← {t.back}</Link>{detail.error instanceof ApiError && detail.error.status === 404 ? <EmptyState icon="submissions" title={t.notFound} description={t.notFoundHelp} /> : <div role="alert"><p className="error">{detail.error?.message ?? t.unavailable}</p><button type="button" onClick={() => void refresh()}>{t.retry}</button></div>}</>;
  const submission = detail.data, current = submission.archivedAt ? null : nextMilestone(submission.milestones, now, timezone), selected = editing && editing !== 'new' ? submission.milestones.find(item => item.id === editing) : undefined;
  return <>
    <Link className="back-link" href="/submissions">← {t.back}</Link>
    <div className="page-heading submission-detail-heading"><div><p className="eyebrow">{t.detail}</p><h1>{submission.name}</h1><p className="page-description">{t.stages[submission.stage]}{submission.year ? ` · ${submission.year}` : ''}{submission.round ? ` · ${submission.round}` : ''}</p></div><button type="button" disabled={archive.isPending} onClick={() => { archive.reset(); if (submission.archivedAt) archive.mutate({ expectedVersion: submission.version, restore: true }); else setArchiveOpen(true); }}>{submission.archivedAt ? t.restore : t.archive}</button></div>
    {submission.archivedAt && <p className="submission-archived-note">{t.archivedNote}</p>}
    {detail.isError && <p className="error" role="alert">{detail.error.message}<button type="button" onClick={() => void refresh()}>{t.retry}</button></p>}
    {archive.isError && !archiveOpen && <p className="error" role="alert">{archive.error.message}<button type="button" onClick={() => void refresh()}>{t.refresh}</button></p>}
    {submission.conferenceSource && <div className="conference-provenance"><strong>{conferenceText.provenance}</strong><a href={submission.conferenceSource.fileUrl} target="_blank" rel="noreferrer">{conferenceText.source} ↗</a><p>{conferenceText.fetchedAt}：{submission.conferenceSource.fetchedAt}</p><p className="help">{conferenceText.snapshot}</p></div>}
    <div className="submission-detail-columns"><div className="submission-metadata"><SubmissionEditor key={`${id}:${metaRevision}`} userId={userId} initial={submission} onSaved={() => setMetaRevision(value => value + 1)} onRefresh={() => void refresh()} /></div><aside className="submission-next"><h2>{t.nextMilestone}</h2>{current ? <><h3>{t.kinds[current.kind]}</h3><DeadlineView milestone={current} timezone={timezone} now={now} /></> : <p className="help">{t.nextUnknown}</p>}</aside></div>
    <div className="milestones-heading"><h2>{t.milestones}</h2>{!submission.archivedAt && <button type="button" className="primary" onClick={() => setEditing('new')}>{t.addMilestone}</button>}</div>
    <MilestoneList milestones={submission.milestones} userId={userId} timezone={timezone} now={now} archived={!!submission.archivedAt} onEdit={setEditing} onRefresh={() => void refresh()} />
    {editing && !submission.archivedAt && (editing === 'new' || selected) && <Dialog title={editing === 'new' ? t.createMilestone : t.editMilestone} onClose={() => setEditing(null)}><MilestoneEditor key={`${editing}:${revision}`} userId={userId} submissionId={id} parentVersion={submission.version} timezone={timezone} now={now} initial={selected} onSaved={() => setEditing(null)} onRefresh={() => void refresh()} /></Dialog>}
    {archiveOpen && <Dialog title={t.archiveTitle} onClose={() => { if (!archive.isPending) setArchiveOpen(false); }}><p>{submission.name}</p><p className="help">{t.archiveHelp}</p>{archive.isError && <p className="error" role="alert">{archive.error.message} {archive.error instanceof ApiError && archive.error.status === 409 && <button type="button" onClick={() => { setArchiveOpen(false); void refresh(); }}>{t.refresh}</button>}</p>}<div className="dialog-actions"><button type="button" disabled={archive.isPending} onClick={() => setArchiveOpen(false)}>{t.cancel}</button><button type="button" disabled={archive.isPending} onClick={() => archive.mutate({ expectedVersion: submission.version, restore: false })}>{t.confirm}</button></div></Dialog>}
  </>;
}
