import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiRunDto, AiConfigDto } from '@research/contracts';
import { resourceKey } from '../../app/query-client';
import { apiRequest } from '../../lib/api-client';
import { writeApi } from '../tasks/task-api';
import { Link } from '../../app/router';
import { aiText as t } from '../../locales/zh-CN';
import { PlanPreview } from './PlanPreview';
import type { AiScope } from './entry';
import { AIResult } from './AIResult';
const done = (run: AiRunDto | undefined) => !!run && ['succeeded', 'failed', 'canceled'].includes(run.status);
export function CommandBar({ userId, onClose, initialInput = '', intent = 'assist', autoSubmit = false, scope }: { userId: string; onClose: () => void; initialInput?: string; intent?: 'assist' | 'capture'; autoSubmit?: boolean; scope?: AiScope | undefined }) {
  const [input, setInput] = useState(initialInput), [runId, setRunId] = useState<string | null>(null), [turns, setTurns] = useState<string[]>([]);
  const autoSent = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const client = useQueryClient(), attempt = useRef<{ text: string; parent: string | null; requestId: string; key: string } | null>(null);
  const config = useQuery({ queryKey: resourceKey('aiConfig', userId), queryFn: ({ signal }) => apiRequest<AiConfigDto>('/ai/config', { signal }) });
  const start = useMutation({ mutationFn: (text: string) => {
    if (attempt.current?.text !== text || attempt.current?.parent !== runId) attempt.current = { text, parent: runId, requestId: crypto.randomUUID(), key: crypto.randomUUID() };
    return writeApi<{ runId: string }>('/ai/interpret', 'POST', { text, requestId: attempt.current.requestId, intent, ...(runId ? { parentRunId: runId } : {}), ...(scope ? { scope } : {}) }, attempt.current.key);
  }, onSuccess: (result, submitted) => { attempt.current = null; setTurns(current => [...current.slice(-7), submitted]); setInput(''); setRunId(result.runId); } });
  useEffect(() => { if (autoSubmit && !autoSent.current && initialInput.trim() && config.data?.configured && config.data.enabled) { autoSent.current = true; start.mutate(initialInput.trim()); } }, [autoSubmit, initialInput, config.data?.configured, config.data?.enabled, start.mutate]);
  const run = useQuery({ queryKey: resourceKey('aiRun', userId, { id: runId }), enabled: !!runId, queryFn: ({ signal }) => apiRequest<AiRunDto>(`/ai/runs/${runId}`, { signal }), refetchInterval: query => done(query.state.data) ? false : 1000 });
  useEffect(() => { if (run.data?.status === 'failed' || run.data?.status === 'canceled') setInput(current => current || turns.at(-1) || initialInput); }, [run.data?.id, run.data?.status]);
  const cancel = useMutation({ mutationFn: () => writeApi<AiRunDto>(`/ai/runs/${runId}/cancel`, 'POST', {}, crypto.randomUUID()), onSuccess: result => client.setQueryData(resourceKey('aiRun', userId, { id: runId }), result) });
  const terminal = done(run.data), busy = start.isPending || !!runId && !terminal;
  useEffect(() => {
    if (!runId || terminal) return;
    const stream = new EventSource(`/api/v1/ai/runs/${runId}/stream`);
    const refresh = () => { void client.invalidateQueries({ queryKey: resourceKey('aiRun', userId, { id: runId }) }); };
    stream.addEventListener('progress', refresh); stream.onopen = refresh;
    return () => stream.close();
  }, [client, runId, terminal, userId]);
  return <div className="ai-command">
    <p className="help">{intent === 'capture' ? '描述研究目标，AI 会结合真实任务、日程和投稿节点生成安排，确认后保存。' : t.help}</p>
    {config.isPending && <p role="status">{t.loading}</p>}
    {config.isError && <p className="error" role="alert">{config.error.message}<button type="button" onClick={() => void config.refetch()}>{t.refresh}</button></p>}
    {config.data && (!config.data.enabled ? <p>{t.disabled} <Link href="/settings/ai" onClick={onClose}>{t.settings}</Link></p> : !config.data.configured ? <p>{t.unconfigured}</p> : <p className="help">DeepSeek · {config.data.model}</p>)}
    {turns.length > 0 && <div className="ai-turns" aria-label="本次对话">{turns.map((turn, index) => <p key={index}><strong>{index === turns.length - 1 ? '最近要求' : '此前要求'}：</strong>{turn}</p>)}</div>}
    <form onSubmit={event => { event.preventDefault(); if (input.trim() && !busy) { autoSent.current = true; start.reset(); cancel.reset(); start.mutate(input.trim()); } }}>
      <label htmlFor="ai-command-input">{runId ? '继续修改或补充要求' : t.input}</label><textarea ref={inputRef} id="ai-command-input" data-autofocus maxLength={2000} rows={4} value={input} onChange={event => setInput(event.target.value)} placeholder={runId ? '例如：改到明天，缩短到半小时，并提前10分钟提醒' : t.placeholder} disabled={busy} />
      <div className="ai-command-actions"><span className="help">{input.length} / 2000</span>{busy && runId && <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{t.stop}</button>}<button className="primary" disabled={busy || !input.trim() || !config.data?.enabled || !config.data.configured}>{busy ? t.running : runId ? '发送修改' : '生成方案'}</button></div>
    </form>
    {runId && !terminal && <p role="status" className="ai-progress">{t.phases[run.data?.phase ?? 'queued']}</p>}
    {start.isError && <p className="error" role="alert">{start.error.message}</p>}
    {run.isError && <p className="error" role="alert">{run.error.message}<button type="button" onClick={() => void run.refetch()}>{t.refresh}</button></p>}
    {cancel.isError && <p className="error" role="alert">{cancel.error.message}</p>}
    {run.data?.error && <p className={run.data.status === 'canceled' ? 'help' : 'error'} role="status">{run.data.error.message}</p>}
    {run.data?.result && (run.data.result.kind === 'plan' ? <PlanPreview key={runId} userId={userId} run={run.data} plan={run.data.result} onClose={onClose} revising={busy || !!input.trim()} /> : <AIResult result={run.data.result} onClose={onClose} />)}
  </div>;
}
