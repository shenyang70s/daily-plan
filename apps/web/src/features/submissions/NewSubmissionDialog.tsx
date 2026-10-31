import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { deadlineCountdown, formatDeadline } from '@research/domain';
import type { ConferenceCatalog, ConferenceCandidate, ConferenceFocus, ConferenceSubmissionResult } from '@research/contracts';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { navigate } from '../../app/router';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { submissionText, conferenceText as t } from '../../locales/zh-CN';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { useNow } from './DeadlineView';
export function NewSubmissionDialog({ userId, timezone, onClose }: { userId: string; timezone: string; onClose: () => void }) {
  return <Dialog title="选择顶会来源" onClose={onClose}><ConferencePicker userId={userId} timezone={timezone} onSaved={id => { onClose(); navigate(`/submissions/${id}`); }} /></Dialog>;
}
function ConferencePicker({ userId, timezone, onSaved }: { userId: string; timezone: string; onSaved: (id: string) => void }) {
  const catalog = useQuery({ queryKey: resourceKey('conferences', userId), staleTime: 60000, queryFn: ({ signal }) => apiRequest<ConferenceCatalog>('/conferences', { signal }) });
  const [focus, setFocus] = useState<ConferenceFocus | ''>(''), [search, setSearch] = useState(''), [year, setYear] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const now = useNow();
  const create = useResourceWrite<ConferenceCandidate, ConferenceSubmissionResult>(userId, (candidate, key) => writeApi('/conferences/create-submission', 'POST', { candidateId: candidate.id, commitSha: candidate.commitSha, submission: { name: candidate.title, year: candidate.year, round: candidate.round, stage: 'planning', submissionUrl: null, draftUrl: null, nextAction: '' } }, key), result => onSaved(result.submission.id));
  if (catalog.isPending) return <p role="status">{t.loading}</p>;
  if (!catalog.data) return <div role="alert"><p className="error">{t.unavailable}：{catalog.error?.message}</p><button type="button" onClick={() => void catalog.refetch()}>{t.retry}</button></div>;
  const isClosed = (item: ConferenceCandidate) => { const full = item.milestones.find(node => node.kind === 'full_paper'); return !!full && deadlineCountdown(full.due, now, timezone).state === 'passed'; };
  const items = catalog.data.items.filter(item => (!focus || item.focuses.includes(focus)) && (!year || item.year === Number(year)) && (!search.trim() || `${item.title} ${item.description} ${item.focuses.map(key => t.focuses[key]).join(' ')}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || b.year - a.year || a.title.localeCompare(b.title) || a.round.localeCompare(b.round));
  const candidate = catalog.data.items.find(item => item.id === selected);
  return <>
    <p className="conference-policy">{t.topOnly}</p><p className="help">{t.focusNote}</p>
    {catalog.data.stale && <p className="conference-stale" role="status">{t.stale}</p>}
    <div className="conference-focus" role="group" aria-label={t.focus}><button type="button" aria-pressed={!focus} onClick={() => setFocus('')}>{t.all}</button>{(Object.entries(t.focuses) as [ConferenceFocus, string][]).map(([value, label]) => <button type="button" key={value} aria-pressed={focus === value} onClick={() => setFocus(value)}>{label}</button>)}</div>
    <div className="conference-search"><label><span className="sr-only">{t.search}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t.searchPlaceholder} maxLength={200} /></label><select aria-label={t.year} value={year} onChange={event => setYear(event.target.value)}><option value="">{t.allYears}</option>{[...new Set(catalog.data.items.map(item => item.year))].sort((a, b) => b - a).map(year => <option key={year} value={year}>{year}</option>)}</select></div>
    <div className="conference-options" aria-label={t.choose}>{items.map(item => { const full = item.milestones.find(node => node.kind === 'full_paper'); return <button type="button" className="conference-option" disabled={create.isPending} key={item.id} aria-pressed={item.id === selected} aria-label={`${item.title} ${item.year} ${item.round}`} onClick={() => setSelected(item.id)}><span className="conference-option-heading"><strong>{item.title} {item.year}</strong><span>{t.rank}</span></span><span className="conference-option-description">{item.description}</span><span>{item.round === 'main' ? t.mainRound : item.round} · {item.focuses.map(key => t.focuses[key]).join(' / ')}</span><span className={isClosed(item) ? 'conference-closed' : 'conference-deadline'}>{isClosed(item) ? t.closed : full?.due ? formatDeadline(full.due, timezone) : t.deadlineUnknown}</span></button>; })}</div>
    {create.isError && <p className="error" role="alert">{create.error.message}</p>}
    {!items.length && <EmptyState icon="submissions" title={t.empty} description={t.emptyHelp} />}
    <p className="conference-snapshot">{t.fetchedAt}：{catalog.data.fetchedAt}<br />{t.checkedAt}：{catalog.data.checkedAt}</p>
    {candidate ? <div className="conference-preview"><h3>{candidate.title} {candidate.year} · {candidate.round === 'main' ? t.mainRound : candidate.round}</h3><div className="conference-source-links"><a href={candidate.fileUrl} target="_blank" rel="noreferrer">{t.source} ↗</a>{candidate.officialUrl && <a href={candidate.officialUrl} target="_blank" rel="noreferrer">{t.official} ↗</a>}</div><h4>{t.preview}</h4><ul>{candidate.milestones.map(node => <li key={node.kind}><strong>{submissionText.kinds[node.kind]}</strong><span>{node.due ? formatDeadline(node.due, node.sourceTimezone ?? (node.due.kind === 'instant' ? node.due.timezone : timezone)) : submissionText.deadlineUnknown}</span><small>{t.original}：{node.rawDeadline}{node.sourceTimezone ? ` · ${node.sourceTimezone}` : ''}</small></li>)}</ul><p className="help">{t.unverified}</p>{!candidate.importable && <p className="error" role="alert">{t.cannotImport}：{candidate.issues.join('；')}</p>}<p className="help">确认后绑定此来源及截止节点；创建后可让 AI 拆解准备任务。</p><button type="button" className="primary" disabled={create.isPending || !candidate.importable} onClick={() => create.mutate(candidate)}>{create.isPending ? '正在创建…' : '确认来源并创建投稿'}</button></div> : <p className="help">{t.select}</p>}
  </>;
}
