import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AiRunDto, CalendarItem, CalendarRange, ManualPlanInput } from '@research/contracts';
import { localDateTimeAt, normalizeDeadline } from '@research/domain';
import { Dialog } from '../../components/Dialog';
import { PlanPreview } from '../ai/PlanPreview';
import { AIResult } from '../ai/AIResult';
import { writeApi } from '../tasks/task-api';
export function CalendarMoveDialog({ userId, item, range, onClose }: { userId: string; item: CalendarItem; range: CalendarRange; onClose: () => void }) {
  const [start, setStart] = useState(localDateTimeAt(range.startAt, range.timezone)), [end, setEnd] = useState(localDateTimeAt(range.endAt, range.timezone)), [error, setError] = useState(''), [prepared, setPrepared] = useState('');
  const started = useRef(false);
  const preview = useMutation({ mutationFn: (body: ManualPlanInput) => writeApi<AiRunDto>('/ai/plan', 'POST', body, crypto.randomUUID()), onSuccess: (_result, body) => { if (body.kind === 'move_block') setPrepared(`${localDateTimeAt(body.range.startAt, range.timezone)}|${localDateTimeAt(body.range.endAt, range.timezone)}`); } });
  function generate() { try { const startAt = normalizeDeadline({ localDateTime: start, timezone: range.timezone }).at, endAt = normalizeDeadline({ localDateTime: end, timezone: range.timezone }).at; if (Date.parse(endAt) <= Date.parse(startAt)) throw Error('结束时间必须晚于开始时间'); setError(''); preview.mutate({ kind: 'move_block', blockId: item.resourceId, expectedVersion: item.version, range: { startAt, endAt, timezone: range.timezone } }); } catch (e) { setError(e instanceof Error ? e.message : '请选择有效时间；夏令时重复或缺失时刻需在详情中明确偏移。'); } }
  useEffect(() => { if (!started.current) { started.current = true; generate(); } }, []);
  return <Dialog title="预览工作块调整" onClose={onClose}><p>{item.title}</p><p className="help">原日程尚未移动。可修改目标时段并更新预览，确认保存后才显示新安排；截止期限保持原样。</p><form className="calendar-move-fields" onSubmit={event => { event.preventDefault(); generate(); }}><div className="task-form-grid"><label>目标开始<input type="datetime-local" step="1" required value={start} onChange={event => setStart(event.target.value)} /></label><label>目标结束<input type="datetime-local" step="1" required value={end} onChange={event => setEnd(event.target.value)} /></label></div><p className="help">显示时区：{range.timezone}</p><button disabled={preview.isPending}>更新改期预览</button></form>
    {error && <p className="error" role="alert">{error}</p>}{preview.isPending && <p role="status">正在检查工作块版本与安排…</p>}{preview.isError && <p className="error" role="alert">{preview.error.message}</p>}{preview.data?.result && (preview.data.result.kind === 'plan' ? <PlanPreview key={preview.data.id} userId={userId} run={preview.data} plan={preview.data.result} onClose={onClose} revising={preview.isPending || prepared !== `${start.length === 16 ? start + ':00' : start}|${end.length === 16 ? end + ':00' : end}`} /> : <AIResult result={preview.data.result} onClose={onClose} />)}
  </Dialog>;
}
