import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ConferenceUpdateChoice, ConferenceUpdateItem, ConferenceUpdatePreview, ConferenceUpdateResult, ConferenceNodeSource } from '@research/contracts';
import { formatDeadline } from '@research/domain';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { submissionText } from '../../locales/zh-CN';
const statusText: Record<ConferenceUpdateItem['status'], string> = { unchanged: '来源期限未变化', changed: '来源已更新', added: '来源新增节点', conflict: '来源更新与本地修订冲突', local_modified: '保留了本地修订', local_deleted: '你已删除本地节点', upstream_removed: '来源已移除此节点', ambiguous: '无法唯一匹配本地节点' };
function SourceNode({ node, timezone }: { node: ConferenceNodeSource | null; timezone: string }) {
  return node ? <><p className="help">节点类型：{submissionText.kinds[node.kind]}</p><p>{node.due ? formatDeadline(node.due, timezone) : '待定 · 无已知截止期限'}</p>{node.due?.kind === 'instant' && node.sourceTimezone && <p className="help">来源时间：{formatDeadline(node.due, node.sourceTimezone)}</p>}<p className="help">来源时区：{node.sourceTimezone ?? '未提供'}</p>{node.sourceUrl && <p><a href={node.sourceUrl} target="_blank" rel="noreferrer">{node.sourceUrl}</a></p>}{node.officialUrl && <p><a href={node.officialUrl} target="_blank" rel="noreferrer">{node.officialUrl}</a></p>}{node.rawDeadline && <p className="help">原文：{node.rawDeadline}</p>}<p className="help">{node.verifiedAt ? `核实于 ${node.verifiedAt}` : '尚未核实'}</p></> : <p className="help">无对应节点</p>;
}
export function SourceUpdatePanel({ userId, submissionId, version, timezone, onApplied }: { userId: string; submissionId: string; version: number; timezone: string; onApplied: () => void }) {
  const [open, setOpen] = useState(false), [accepted, setAccepted] = useState<Set<string>>(new Set()), toast = useToast();
  const preview = useMutation({ mutationFn: () => writeApi<ConferenceUpdatePreview>('/conferences/import-preview', 'POST', { submissionId, expectedVersion: version }, crypto.randomUUID()), onSuccess: () => setAccepted(new Set()) });
  const confirm = useResourceWrite<ConferenceUpdateChoice, ConferenceUpdateResult>(userId, (body, key) => writeApi(`/conferences/import-proposals/${preview.data!.id}/confirm`, 'POST', body, key), result => { toast(result.applied ? `已更新 ${result.applied} 个来源节点` : '已保留全部本地节点'); setOpen(false); onApplied(); });
  const data = preview.data;
  function check() { confirm.reset(); preview.reset(); setAccepted(new Set()); preview.mutate(); }
  function close() { if (!confirm.isPending) setOpen(false); }
  return <><button type="button" disabled={preview.isPending} onClick={() => { setOpen(true); check(); }}>检查来源更新</button>{open && <Dialog title="核对投稿来源更新" onClose={close}>
    {preview.isPending && <p role="status">正在读取固定顶会来源，比较远端、本地和上次接受的期限…</p>}
    {preview.isError && <div role="alert"><p className="error">{preview.error.message}</p><button type="button" onClick={check}>重新检查</button></div>}
    {data && <div className="conference-update-preview"><h3>{data.submissionName}</h3><p>本地修订默认保留。勾选明确希望采用的来源节点，确认后才保存。</p><p className="help">上游移除不会删除本地节点；手工添加的其他节点保持原样。来源变化可能包含上游约定的时间，采用后仍标记为待核实。</p>
      <details><summary>本次来源与有效期</summary><p className="help">原基准：{data.previousSha}<br />检查版本：{data.commitSha}<br />获取时间：{data.fetchedAt}<br />检查时间：{data.checkedAt}<br />预览到期：{data.expiresAt}</p>{data.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer">查看锁定版本来源 ↗</a>}</details>
      {data.stale && <p className="error" role="status">当前来源连接不可用，仅展示离线缓存，不能应用。请恢复连接后重新检查。</p>}{data.issues.length > 0 && <ul className="error">{data.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
      <div className="conference-update-items">{data.items.map(item => { const canApply = !!item.remote && item.status !== 'ambiguous' && item.status !== 'unchanged' && !data.stale && !data.issues.length; return <article key={item.kind}><h4>{submissionText.kinds[item.kind]} <span className="pill">{statusText[item.status]}</span></h4>{item.inferred && <p className="help">此旧记录缺少原始节点绑定，按唯一同类节点匹配，请确认它是要更新的目标。</p>}{item.status === 'ambiguous' && <p className="help">存在同类手工节点或多个可能目标，请先在详情整理。本次不会自动覆盖或新增。</p>}
        <div className="conference-update-columns"><section><h5>上次接受的来源</h5><SourceNode node={item.baseline} timezone={timezone} /></section><section><h5>当前本地</h5>{item.localMatches.length > 0 ? item.localMatches.map(local => <SourceNode key={local.id} node={local} timezone={timezone} />) : <SourceNode node={item.local} timezone={timezone} />}</section><section><h5>本次来源</h5><SourceNode node={item.remote} timezone={timezone} /></section></div>
        {item.pendingRelativeReminders > 0 && <p className="help">采用来源将影响 {item.pendingRelativeReminders} 条待触发相对提醒：{item.remote?.due ? '按新期限重算' : '待定期限无法计算，相对提醒将取消'}。固定时刻提醒保持不变。</p>}
        <label className="source-update-choice"><input type="checkbox" checked={accepted.has(item.kind)} disabled={!canApply || confirm.isPending} onChange={event => setAccepted(current => { const next = new Set(current); if (event.target.checked) next.add(item.kind); else next.delete(item.kind); return next; })} />{item.status === 'local_deleted' ? `恢复并采用${submissionText.kinds[item.kind]}来源节点` : `采用${submissionText.kinds[item.kind]}来源更新`}</label>{!accepted.has(item.kind) && <p className="help">本次选择：保留本地</p>}
      </article>; })}</div>
      {confirm.isError && <p className="error" role="alert">{confirm.error.message}。当前选择已保留；如版本变化或预览过期，请重新检查。</p>}
      <div className="dialog-actions"><button type="button" disabled={confirm.isPending} onClick={check}>重新检查</button><button type="button" disabled={confirm.isPending} onClick={close}>取消</button><button type="button" className="primary" disabled={confirm.isPending} onClick={() => confirm.mutate({ confirm: true, choices: data.items.map(item => ({ kind: item.kind, action: accepted.has(item.kind) ? 'use_source' : 'keep_local' })) })}>{confirm.isPending ? '正在保存…' : accepted.size ? `确认更新 ${accepted.size} 个节点` : '确认保留本地'}</button></div>
    </div>}
  </Dialog>}</>;
}
