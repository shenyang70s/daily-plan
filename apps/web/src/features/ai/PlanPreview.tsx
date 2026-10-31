import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AiRunDto, AiPlan, AiExecutionDto, AiDeleteChallenge } from '@research/contracts';
import { resourceKey } from '../../app/query-client';
import { Link } from '../../app/router';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { useResourceWrite, writeApi } from '../tasks/task-api';
export function PlanPreview({ userId, run, plan, onClose, revising }: { userId: string; run: AiRunDto; plan: AiPlan; onClose: () => void; revising: boolean }) {
  const client = useQueryClient(), key = useRef(crypto.randomUUID()), toast = useToast();
  const [execution, setExecution] = useState<AiExecutionDto | null>(null), [deleteOpen, setDeleteOpen] = useState(false), [ack, setAck] = useState('');
  function saved(result: AiExecutionDto) { setExecution(result); client.setQueryData<AiRunDto>(resourceKey('aiRun', userId, { id: run.id }), current => current ? { ...current, execution: result } : current); window.dispatchEvent(new Event('research:task-created')); }
  const undo = useResourceWrite<Record<string, never>, AiExecutionDto>(userId, (_body, attemptKey) => writeApi(`/ai/runs/${run.id}/undo`, 'POST', { confirm: true }, attemptKey), result => { saved(result); toast('方案已撤销'); });
  const confirm = useResourceWrite<{ deletionToken?: string; deleteAcknowledgement?: string }, AiExecutionDto>(userId, body => writeApi(`/ai/runs/${run.id}/confirm`, 'POST', { confirm: true, ...body }, key.current), result => {
    saved(result); setDeleteOpen(false);
    if (result.undo) toast('方案已执行', { label: '撤销', success: '方案已撤销', run: () => undo.mutateAsync({}).then(() => {}) });
    else toast('方案已执行');
  });
  const deletion = useMutation({ mutationFn: () => writeApi<AiDeleteChallenge>(`/ai/runs/${run.id}/deletion-confirmation`, 'POST', { confirm: true }, crypto.randomUUID()), onSuccess: () => { key.current = crypto.randomUUID(); setAck(''); setDeleteOpen(true); } });
  const executed = execution ?? run.execution ?? confirm.data, deleteCount = plan.actions.filter(a => a.kind === 'task_delete').length;
  if (executed?.undo?.undoneAt) return <section className="ai-plan-preview" role="status"><h3>方案已撤销</h3><p>记录已恢复到执行前的状态，版本号继续递增。</p><p className="help">已经派发或取消的提醒不会重放。</p><Link href="/tasks" onClick={onClose}>查看任务 →</Link></section>;
  if (executed) return <section className="ai-plan-preview" role="status"><h3>方案已执行</h3><p className="help">{new Date(executed.executedAt).toLocaleString('zh-CN')} · 已保存 {executed.items.length} 项操作，可继续输入调整。</p><ul className="ai-query-results">{executed.items.map((item, index) => <li key={`${item.id}:${index}`}><Link href={item.href} onClick={onClose}>{item.label} →</Link></li>)}</ul>{executed.undo && <><p className="help">可在24小时内撤销；有后续编辑或新冲突时会保留最新记录并拒绝覆盖。已派发或取消的提醒不重放。</p><button type="button" disabled={undo.isPending || Date.parse(executed.undo.expiresAt) <= Date.now()} onClick={() => undo.mutate({})}>{undo.isPending ? '正在撤销…' : '撤销此次执行'}</button></>}{undo.isError && <p className="error" role="alert">{undo.error.message}</p>}</section>;
  return <section className="ai-plan-preview" aria-label="AI 方案预览"><h3>{plan.title}</h3><p>{plan.explanation}</p><p className="help">尚未保存。可在上方继续输入修改要求，确认后统一执行。</p><details className="ai-context"><summary>本次规划依据</summary><p>{plan.contextSummary}</p></details>
    {!!plan.assumptions.length && <div><strong>方案假设</strong><ul>{plan.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}{!!plan.warnings.length && <div className="ai-plan-warnings" role="status"><strong>需要留意</strong><ul>{plan.warnings.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
    <ol className="ai-plan-actions">{plan.impacts.map((impact, index) => <li key={index}><h4>{impact.label}</h4>{impact.before.length > 0 && <details><summary>修改前</summary><ul>{impact.before.map((line, i) => <li key={i}>{line}</li>)}</ul></details>}<ul>{impact.after.map((line, i) => <li key={i}>{line}</li>)}</ul></li>)}</ol>
    {(confirm.isError || deletion.isError) && <p className="error" role="alert">{confirm.error?.message ?? deletion.error?.message}。请根据最新数据重新生成方案。</p>}{run.superseded && <p role="status">此方案已被后续对话替代，请确认最新方案。</p>}
    <div className="dialog-actions"><button type="button" disabled={confirm.isPending} onClick={onClose}>取消</button><button type="button" className={deleteCount ? 'danger' : 'primary'} disabled={confirm.isPending || deletion.isPending || revising || !!run.superseded} onClick={() => deleteCount ? deletion.mutate() : confirm.mutate({})}>{confirm.isPending ? '正在保存…' : deleteCount ? `继续核对删除 ${deleteCount} 项任务` : `确认执行 ${plan.actions.length} 项操作`}</button></div>
    {deleteOpen && deletion.data && <Dialog title="再次确认删除任务" onClose={() => { if (!confirm.isPending) setDeleteOpen(false); }}><p>本方案将删除 {deletion.data.count} 项任务，并执行预览中的其他操作。</p><ul>{plan.actions.map((a, index) => a.kind === 'task_delete' ? <li key={a.id}>{plan.impacts[index]!.label}</li> : null)}</ul><p className="help">任务及其工作块将从列表隐藏，待触发提醒会取消。可在24小时内、没有后续修改时撤销。</p><label className="ai-delete-ack">请输入“删除{deletion.data.count}项任务”<input value={ack} onChange={event => setAck(event.target.value)} autoComplete="off" /></label>{confirm.isError && <p className="error" role="alert">{confirm.error.message}</p>}<div className="dialog-actions"><button type="button" disabled={confirm.isPending} onClick={() => setDeleteOpen(false)}>返回预览</button><button type="button" className="danger" disabled={confirm.isPending || ack !== `删除${deletion.data.count}项任务` || Date.parse(deletion.data.expiresAt) <= Date.now()} onClick={() => confirm.mutate({ deletionToken: deletion.data!.token, deleteAcknowledgement: ack })}>确认删除并执行方案</button></div></Dialog>}
  </section>;
}
