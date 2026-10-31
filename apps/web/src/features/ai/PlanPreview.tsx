import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AiRunDto, AiPlan, AiExecutionDto } from '@research/contracts';
import { resourceKey } from '../../app/query-client';
import { Link } from '../../app/router';
import { useResourceWrite, writeApi } from '../tasks/task-api';
export function PlanPreview({ userId, run, plan, onClose, revising }: { userId: string; run: AiRunDto; plan: AiPlan; onClose: () => void; revising: boolean }) {
  const client = useQueryClient(), key = useRef(crypto.randomUUID());
  const confirm = useResourceWrite<Record<string, never>, AiExecutionDto>(userId, () => writeApi(`/ai/runs/${run.id}/confirm`, 'POST', { confirm: true }, key.current), result => {
    client.setQueryData<AiRunDto>(resourceKey('aiRun', userId, { id: run.id }), current => current ? { ...current, execution: result } : current);
    window.dispatchEvent(new Event('research:task-created'));
  });
  const executed = run.execution ?? confirm.data;
  if (executed) return <section className="ai-plan-preview" role="status"><h3>方案已执行</h3><p className="help">{new Date(executed.executedAt).toLocaleString('zh-CN')} · 已保存 {executed.items.length} 项操作，可继续输入调整。</p><ul className="ai-query-results">{executed.items.map((item, index) => <li key={`${item.id}:${index}`}><Link href={item.href} onClick={onClose}>{item.label} →</Link></li>)}</ul></section>;
  return <section className="ai-plan-preview" aria-label="AI 方案预览"><h3>{plan.title}</h3><p>{plan.explanation}</p><p className="help">尚未保存。可在上方继续输入修改要求，确认后统一执行。</p><details className="ai-context"><summary>本次规划依据</summary><p>{plan.contextSummary}</p></details>
    {!!plan.assumptions.length && <div><strong>方案假设</strong><ul>{plan.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
    {!!plan.warnings.length && <div className="ai-plan-warnings" role="status"><strong>需要留意</strong><ul>{plan.warnings.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
    <ol className="ai-plan-actions">{plan.impacts.map((impact, index) => <li key={index}><h4>{impact.label}</h4>{impact.before.length > 0 && <details><summary>修改前</summary><ul>{impact.before.map((line, i) => <li key={i}>{line}</li>)}</ul></details>}<ul>{impact.after.map((line, i) => <li key={i}>{line}</li>)}</ul></li>)}</ol>
    {confirm.isError && <p className="error" role="alert">{confirm.error.message}。请在上方说明修改要求或输入“根据最新数据重新安排”。</p>}
    {run.superseded && <p role="status">此方案已被后续对话替代，请确认最新方案。</p>}
    <div className="dialog-actions"><button type="button" disabled={confirm.isPending} onClick={onClose}>取消</button><button type="button" className="primary" disabled={confirm.isPending || revising || !!run.superseded} onClick={() => confirm.mutate({})}>{confirm.isPending ? '正在保存…' : `确认执行 ${plan.actions.length} 项操作`}</button></div>
  </section>;
}
