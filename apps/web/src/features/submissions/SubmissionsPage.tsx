import { AiEntry } from '../ai/AiEntry';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { nextMilestone } from '@research/domain';
import type { CursorPage, SubmissionDto } from '@research/contracts';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { Link } from '../../app/router';
import { text, submissionText as t } from '../../locales/zh-CN';
import { EmptyState } from '../../components/EmptyState';
import { DeadlineView, useNow } from './DeadlineView';
import { Dialog } from '../../components/Dialog';
import { navigate } from '../../app/router';
import { NewSubmissionDialog } from './NewSubmissionDialog';
import { SubmissionDetailPanel } from './SubmissionDetailPanel';
interface Props { userId: string; timezone: string; id?: string | undefined }
export function SubmissionsPage({ userId, timezone, id }: Props) { return <><SubmissionList userId={userId} timezone={timezone} />{id && <Dialog variant="drawer" title={t.detail} onClose={() => navigate('/submissions')}><SubmissionDetailPanel embedded key={id} id={id} userId={userId} timezone={timezone} /></Dialog>}</>; }
function SubmissionList({ userId, timezone }: Omit<Props, 'id'>) {
  const [filters, setFilters] = useState({ q: '', stage: '', year: '', archived: 'false' }), [creating, setCreating] = useState(false);
  const now = useNow();
  const list = useInfiniteQuery({ queryKey: resourceKey('submissions', userId, filters), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => {
    const params = new URLSearchParams({ limit: '20' }); for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value); if (pageParam) params.set('cursor', pageParam);
    return apiRequest<CursorPage<SubmissionDto>>(`/submissions?${params}`, { signal });
  }, getNextPageParam: page => page.nextCursor ?? undefined });
  const items = list.data?.pages.flatMap(page => page.items) ?? [], filtered = !!(filters.q || filters.stage || filters.year);
  return <>
    <div className="page-heading task-page-heading"><div><p className="eyebrow">FROM IDEAS TO SUBMISSIONS</p><h1>{t.title}</h1><p className="page-description">{text.pageDescriptions.submissions}</p></div></div>
    <AiEntry placeholder="告诉 AI 投稿目标，或根据已有截止节点安排准备任务……" /><p className="help">需要核对会议期限？<button type="button" onClick={() => setCreating(true)}>选择顶会来源</button></p>
    <div className="submission-filters"><label><span className="sr-only">{t.search}</span><input type="search" placeholder={t.searchPlaceholder} maxLength={200} value={filters.q} onChange={event => setFilters({ ...filters, q: event.target.value })} /></label><select aria-label={t.allStages} value={filters.stage} onChange={event => setFilters({ ...filters, stage: event.target.value })}><option value="">{t.allStages}</option>{Object.entries(t.stages).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><label><span className="sr-only">{t.year}</span><input className="submission-year-filter" type="number" placeholder={t.year} min={1900} max={2200} value={filters.year} onChange={event => setFilters({ ...filters, year: event.target.value })} /></label><select aria-label={t.archiveFilter} value={filters.archived} onChange={event => setFilters({ ...filters, archived: event.target.value })}><option value="false">{t.active}</option><option value="true">{t.archived}</option></select>{filtered && <button type="button" onClick={() => setFilters({ q: '', stage: '', year: '', archived: filters.archived })}>{t.clearFilters}</button>}</div>
    {list.isPending ? <p role="status">{t.loading}</p> : list.isError && !list.data ? <div role="alert"><p className="error">{t.unavailable}：{list.error.message}</p><button type="button" onClick={() => void list.refetch()}>{t.retry}</button></div> : items.length === 0 ? <EmptyState icon="submissions" title={filtered ? t.filteredEmpty : t.empty} description={filtered ? t.filteredEmptyHelp : t.emptyHelp} /> : <>
      <div className="submission-list">{items.map(submission => { const upcoming = submission.archivedAt ? null : nextMilestone(submission.milestones, now, timezone); return <article key={submission.id} className="submission-card"><header><span className="submission-mark">{submission.name.slice(0, 1).toUpperCase()}</span><div><Link className="submission-name" href={`/submissions/${submission.id}`}>{submission.name}{submission.year ? ` ${submission.year}` : ''}</Link><p className="submission-cycle">{[submission.round, submission.conferenceSource?.title].filter(value => value != null && value !== '').join(' · ')}</p></div><span className={`submission-stage stage-${submission.stage}`}>{t.stages[submission.stage]}</span></header><div className="submission-stage-track" aria-label={`投稿阶段：${t.stages[submission.stage]}`}>{['planning', 'preparing', 'internal_review', 'submitted', 'under_review', 'rebuttal', 'decision', 'accepted'].map((stage, index, stages) => <span key={stage} className={index <= stages.indexOf(submission.stage) ? 'filled' : ''} />)}</div>{submission.nextAction && <p className="submission-next-action">下一步 · {submission.nextAction}</p>}<div className="submission-card-next"><span>{submission.archivedAt ? t.archived : t.nextMilestone}</span>{upcoming ? <><h3>{t.kinds[upcoming.kind]}</h3><DeadlineView milestone={upcoming} timezone={timezone} now={now} compact /></> : <p className="help">{submission.archivedAt ? t.archivedNote : t.nextUnknown}</p>}</div></article>; })}</div>
      {list.isError && <p className="error" role="alert">{list.error.message}<button type="button" onClick={() => void list.refetch()}>{t.retry}</button></p>}{list.hasNextPage && <div className="load-more"><button type="button" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? t.loading : t.loadMore}</button></div>}
    </>}
    {creating && <NewSubmissionDialog userId={userId} timezone={timezone} onClose={() => setCreating(false)} />}
  </>;
}
