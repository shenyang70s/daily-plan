import { useState } from 'react';
import { CreateSubmissionSchema, UpdateSubmissionSchema } from '@research/contracts';
import type { CreateSubmissionInput, UpdateSubmissionInput, SubmissionDto, ConferenceCandidate, ConferenceSubmissionResult } from '@research/contracts';
import { submissionText as t, conferenceText } from '../../locales/zh-CN';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api-client';
function editorFields(initial?: SubmissionDto) { return { name: initial?.name ?? '', year: initial?.year?.toString() ?? '', round: initial?.round ?? '', stage: initial?.stage ?? 'planning', submissionUrl: initial?.submissionUrl ?? '', draftUrl: initial?.draftUrl ?? '', nextAction: initial?.nextAction ?? '' }; }
export function SubmissionEditor({ userId, initial, conference, onSaved, onRefresh }: { userId: string; initial?: SubmissionDto | undefined; conference?: ConferenceCandidate | undefined; onSaved?: (result: SubmissionDto) => void; onRefresh?: () => void }) {
  const [snapshot] = useState(initial);
  const [fields, setFields] = useState(() => conference ? { ...editorFields(), name: conference.title, year: String(conference.year), round: conference.round } : editorFields(initial));
  const expectedVersion = JSON.stringify(editorFields(initial)) === JSON.stringify(editorFields(snapshot)) ? initial?.version : snapshot?.version;
  const [invalid, setInvalid] = useState(false), toast = useToast();
  const save = useResourceWrite<CreateSubmissionInput | UpdateSubmissionInput, SubmissionDto | ConferenceSubmissionResult>(userId, (body, key) => conference ? writeApi('/conferences/create-submission', 'POST', { candidateId: conference.id, commitSha: conference.commitSha, submission: body }, key) : writeApi(snapshot ? `/submissions/${snapshot.id}` : '/submissions', snapshot ? 'PATCH' : 'POST', body, key), result => {
    if ('submission' in result) { toast(result.created ? conferenceText.created : conferenceText.existing); onSaved?.(result.submission); }
    else { toast(snapshot ? t.saved : t.created); onSaved?.(result); }
  });
  function submit() {
    const body = { ...fields, year: fields.year === '' ? null : Number(fields.year), round: fields.round || null, submissionUrl: fields.submissionUrl || null, draftUrl: fields.draftUrl || null };
    const result = snapshot ? UpdateSubmissionSchema.safeParse({ ...body, expectedVersion }) : CreateSubmissionSchema.safeParse(body);
    setInvalid(!result.success); if (result.success && !save.isPending) save.mutate(result.data);
  }
  const change = (name: keyof typeof fields, value: string) => setFields(current => ({ ...current, [name]: value }));
  return <form className="submission-editor" onSubmit={event => { event.preventDefault(); submit(); }}>
    {conference && <p className="help">{conferenceText.bound}</p>}
    <fieldset disabled={save.isPending || !!initial?.archivedAt}>
      <label>{t.name}<input data-autofocus disabled={!!conference} required maxLength={200} value={fields.name} onChange={event => change('name', event.target.value)} /></label>
      <div className="task-form-grid"><label>{t.year}<input disabled={!!conference} type="number" min={1900} max={2200} step={1} value={fields.year} onChange={event => change('year', event.target.value)} /></label><label>{t.round}<input disabled={!!conference} maxLength={80} value={fields.round} onChange={event => change('round', event.target.value)} /></label></div>
      <label>{t.stage}<select aria-label={t.stage} value={fields.stage} onChange={event => change('stage', event.target.value)}>{Object.entries(t.stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>{t.submissionUrl}<input type="url" value={fields.submissionUrl} onChange={event => change('submissionUrl', event.target.value)} /></label><label>{t.draftUrl}<input type="url" value={fields.draftUrl} onChange={event => change('draftUrl', event.target.value)} /></label>
      <label>{t.nextAction}<textarea aria-label={t.nextAction} rows={3} maxLength={2000} value={fields.nextAction} onChange={event => change('nextAction', event.target.value)} /></label>
    </fieldset>
    {invalid && <p className="error" role="alert">{t.invalidInput}</p>}
    {save.isError && <p className="error" role="alert">{save.error.message} {save.error instanceof ApiError && save.error.status === 409 && onRefresh && <button type="button" onClick={onRefresh}>{t.refresh}</button>}</p>}
    {!initial?.archivedAt && <div className="task-form-footer"><span className="help">{snapshot ? `${t.version} ${expectedVersion}` : ''}</span><button className="primary" disabled={save.isPending || !!conference && !conference.importable}>{save.isPending ? t.saving : snapshot ? t.save : conference ? conferenceText.create : t.create}</button></div>}
  </form>;
}
