import { useState } from 'react';
import { calendarOffsetAt, localDateTimeAt } from '@research/domain';
import { CreateMilestoneSchema, UpdateMilestoneSchema } from '@research/contracts';
import type { CreateMilestoneInput, UpdateMilestoneInput, MilestoneDto, MilestoneKind } from '@research/contracts';
import { submissionText as t } from '../../locales/zh-CN';
import { ApiError } from '../../lib/api-client';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { useToast } from '../../components/Toast';
import { DeadlineView, MilestoneSource } from './DeadlineView';
type Body = CreateMilestoneInput | UpdateMilestoneInput;
export function MilestoneEditor({ userId, submissionId, parentVersion, timezone, now, initial, onSaved, onRefresh }: { userId: string; submissionId: string; parentVersion: number; timezone: string; now: number; initial?: MilestoneDto | undefined; onSaved: () => void; onRefresh: () => void }) {
  const [snapshot] = useState(initial), [originalParentVersion] = useState(parentVersion);
  const [kind, setKind] = useState<MilestoneKind>(initial?.kind ?? 'abstract');
  const [mode, setMode] = useState<'unknown' | 'date' | 'instant'>(initial?.due?.kind ?? 'unknown');
  const source = initial?.sourceTimezone ?? (initial?.due?.kind === 'instant' ? initial.due.timezone : '');
  const [sourceTimezone, setSourceTimezone] = useState(source), [date, setDate] = useState(initial?.due?.kind === 'date' ? initial.due.date : ''), [local, setLocal] = useState(initial?.due?.kind === 'instant' ? localDateTimeAt(initial.due.at, source) : ''), [offset, setOffset] = useState(initial?.due?.kind === 'instant' ? calendarOffsetAt(initial.due.at, source) : '');
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? ''), [officialUrl, setOfficialUrl] = useState(initial?.officialUrl ?? ''), [verifiedAt, setVerifiedAt] = useState(initial?.verifiedAt ?? '');
  const [invalid, setInvalid] = useState(false), [accepted, setAccepted] = useState(false), [preview, setPreview] = useState<{ body: Body; before: MilestoneDto; after: MilestoneDto } | null>(null);
  const toast = useToast();
  const save = useResourceWrite<Body, MilestoneDto>(userId, (body, key) => writeApi(snapshot ? `/milestones/${snapshot.id}` : `/submissions/${submissionId}/milestones`, snapshot ? 'PATCH' : 'POST', body, key), () => { toast(snapshot ? t.milestoneSaved : t.milestoneCreated); onSaved(); });
  function handleError(error: Error, body: Body) {
    if (error instanceof ApiError && error.code === 'DEADLINE_CONFIRMATION_REQUIRED' && error.details.before && error.details.after) { setPreview({ body, before: error.details.before as MilestoneDto, after: error.details.after as MilestoneDto }); setAccepted(false); }
  }
  function submit() {
    const deadline = mode === 'instant' ? { localDeadline: { localDateTime: local, timezone: sourceTimezone.trim(), ...(offset ? { offset: offset.trim() } : {}) } } : { due: mode === 'date' ? { kind: 'date', date } : null };
    const fields = { kind, ...deadline, sourceTimezone: sourceTimezone.trim() || null, sourceUrl: sourceUrl || null, officialUrl: officialUrl || null, verifiedAt: verifiedAt || null };
    const parsed = snapshot ? UpdateMilestoneSchema.safeParse({ ...fields, expectedVersion: snapshot.version }) : CreateMilestoneSchema.safeParse({ ...fields, expectedSubmissionVersion: originalParentVersion });
    setInvalid(!parsed.success); if (parsed.success && !save.isPending) save.mutate(parsed.data, { onError: error => handleError(error, parsed.data) });
  }
  return <form className="milestone-editor" onSubmit={event => { event.preventDefault(); if (!preview) submit(); }}>
    <fieldset disabled={save.isPending || !!preview}>
      <label>{t.kind}<select aria-label={t.kind} value={kind} onChange={event => setKind(event.target.value as MilestoneKind)}>{Object.entries(t.kinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>{t.deadlineKind}<select aria-label={t.deadlineKind} value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="unknown">{t.unknown}</option><option value="date">{t.dateOnly}</option><option value="instant">{t.instant}</option></select></label>
      {mode === 'date' && <label>{t.date}<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>}
      {mode === 'instant' && <label>{t.localDateTime}<input type="datetime-local" required step="1" value={local} onChange={event => { setLocal(event.target.value); setOffset(''); }} /></label>}
      <label>{t.sourceTimezone}<input required={mode === 'instant'} value={sourceTimezone} maxLength={64} onChange={event => { setSourceTimezone(event.target.value); setOffset(''); }} /></label><p className="help">{t.timezoneHint}</p>
      {mode === 'instant' && <><label>{t.offset}<input value={offset} placeholder="-07:00" onChange={event => setOffset(event.target.value)} /></label><p className="help">{t.offsetHint}</p></>}
      <label>{t.sourceUrl}<input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} /></label><label>{t.officialUrl}<input type="url" value={officialUrl} onChange={event => setOfficialUrl(event.target.value)} /></label>
      <label>{t.verifiedAt}<input value={verifiedAt} placeholder="2026-10-30T08:00:00Z" onChange={event => setVerifiedAt(event.target.value)} /></label><button type="button" onClick={() => setVerifiedAt(new Date().toISOString())}>{t.markVerified}</button>
    </fieldset>
    {invalid && <p className="error" role="alert">{t.invalidMilestone}</p>}
    {save.isError && !preview && <p className="error" role="alert">{save.error.message} {save.error instanceof ApiError && save.error.code === 'VERSION_CONFLICT' && <button type="button" onClick={onRefresh}>{t.refresh}</button>}</p>}
    {preview ? <div className="milestone-preview"><h3>{t.previewTitle}</h3><div className="milestone-preview-columns">{([{ label: t.before, value: preview.before }, { label: t.after, value: preview.after }]).map(item => <div key={item.label}><h4>{item.label} · {t.kinds[item.value.kind]}</h4><DeadlineView milestone={item.value} timezone={timezone} now={now} /><MilestoneSource milestone={item.value} /></div>)}</div><label className="submission-checkbox"><input type="checkbox" checked={accepted} disabled={save.isPending} onChange={event => setAccepted(event.target.checked)} />{t.confirmEdit}</label><div className="dialog-actions"><button type="button" disabled={save.isPending} onClick={() => { setPreview(null); setAccepted(false); save.reset(); }}>{t.backToEdit}</button><button type="button" className="primary" disabled={!accepted || save.isPending} onClick={() => { const body = { ...preview.body, confirmDeadlineChange: true as const }; save.mutate(body, { onError: error => handleError(error, body) }); }}>{t.confirmSave}</button></div></div> : <div className="task-form-footer"><span className="help">{snapshot ? `${t.version} ${snapshot.version}` : ''}</span><button className="primary" disabled={save.isPending}>{save.isPending ? t.saving : snapshot ? t.preview : t.saveMilestone}</button></div>}
  </form>;
}
