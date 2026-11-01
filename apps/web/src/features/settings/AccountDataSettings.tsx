import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AccountStatusDto } from '@research/contracts';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { Dialog } from '../../components/Dialog';
import { ResourceOverview } from '../../components/ResourceOverview';
import { useToast } from '../../components/Toast';

export function AccountDataSettings({ userId, username, onDeleted }: { userId: string; username: string; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const toast = useToast(), phrase = `删除账户 ${username}`;
  const status = useQuery({ queryKey: resourceKey('accountStatus', userId), queryFn: ({ signal }) => apiRequest<AccountStatusDto>('/account/status', { signal }), refetchInterval: 15000 });
  const download = useMutation({ mutationFn: async (format: 'json' | 'csv') => {
    const blob = await apiRequest<Blob>(`/account/export?format=${format}`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `research-tasks-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, onSuccess: () => toast('数据文件已生成，请查看浏览器下载') });
  const remove = useMutation({ mutationFn: () => apiRequest('/account', { method: 'DELETE', body: JSON.stringify({ password, confirmation }) }), onSuccess: onDeleted, onError: () => setPassword('') });
  const close = () => { if (!remove.isPending) { setDeleting(false); setPassword(''); setConfirmation(''); remove.reset(); } };
  const number = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  return <div className="account-data-settings">
    <section className="account-data-section"><h2>个人数据导出</h2><p className="help">下载当前账户的任务、日程、投稿来源、提醒、通知和 AI 历史。包含已归档和已删除的任务记录，不包含密码、会话或推送密钥。文件包含私人内容，请妥善保存。</p><p className="help">JSON 保留结构；CSV 以记录类型、记录 ID 和 JSON 数据三列保存关联记录。导出文件用于查阅与留存，不能替代数据库备份。</p><div className="account-data-actions"><button type="button" disabled={download.isPending} onClick={() => download.mutate('json')}>{download.isPending && download.variables === 'json' ? '正在导出…' : '导出 JSON'}</button><button type="button" disabled={download.isPending} onClick={() => download.mutate('csv')}>{download.isPending && download.variables === 'csv' ? '正在导出…' : '导出 CSV'}</button></div>{download.isError && <p className="error" role="alert">{download.error.message}</p>}</section>
    <section className="account-data-section"><div className="account-status-heading"><h2>运行状态</h2><button type="button" disabled={status.isFetching} onClick={() => void status.refetch()}>刷新状态</button></div><p className="help">仅统计当前账户。静音或通知偏好可能延后提醒；失败记录可在对应目标中查看、重新安排。</p>
      {status.isPending ? <p role="status">正在读取运行状态…</p> : status.data && <><ResourceOverview fields={[
        ['待处理到期提醒', status.data.reminders.overdue], ['到期投递队列', status.data.reminders.queuedDeliveries], ['最久等待', `${number(status.data.reminders.oldestWaitSeconds)} 秒`], ['失败投递', `${status.data.reminders.failedDeliveries} 条应用内 / ${status.data.reminders.failedPushDeliveries} 条推送`],
        ['AI 请求', `近24小时 ${status.data.ai.completed} 次已结束，失败 ${status.data.ai.failed} 次`], ['AI 失败率', status.data.ai.failureRate == null ? '暂无样本' : `${number(status.data.ai.failureRate * 100)}%`], ['AI 平均耗时', status.data.ai.avgDurationMs == null ? '暂无样本' : `${number(status.data.ai.avgDurationMs)} ms`],
        ['普通 API', `${status.data.api.requests} 次请求 / ${status.data.api.errors} 次错误`], ['API 平均耗时', `${number(status.data.api.avgDurationMs)} ms`], ['API p95', `${number(status.data.api.p95DurationMs)} ms`],
      ]} /><p className="help">API 指标从 {new Date(status.data.api.since).toLocaleString('zh-CN')} 起在当前进程内统计；p95 使用最近 {status.data.api.sampleCount} 次样本（最多128次），重启清零，不含 AI、数据导出及持续连接耗时。AI 耗时包含排队与解析，取消和手动方案不计入成功/失败样本。</p></>}
      {status.isError && <p className="error" role="alert">状态读取失败：{status.error.message}</p>}
    </section>
    <section className="account-data-section"><h2>删除账户</h2><p className="help">永久删除当前账户在本系统中的业务数据，注销所有会话，并移除提醒与推送订阅。建议先导出需要保留的内容。</p><button type="button" className="danger" onClick={() => { remove.reset(); setDeleting(true); }}>删除账户及数据</button></section>
    {deleting && <Dialog title="删除账户" onClose={close}><form className="account-delete-form" onSubmit={event => { event.preventDefault(); if (confirmation === phrase && password && !remove.isPending) remove.mutate(); }}><p>即将永久删除账户 <strong>{username}</strong> 及其在当前数据库中的数据。此操作无法撤销。</p><p className="help">已有备份不在本次删除范围内，需要按部署环境的保留策略另行清理；已发出的外部通知无法撤回。</p><fieldset disabled={remove.isPending}><label>当前密码<input type="password" autoComplete="current-password" data-autofocus maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required /></label><label>请输入“{phrase}”<input autoComplete="off" maxLength={80} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label></fieldset>{remove.isError && <p className="error" role="alert">{remove.error.message}</p>}<div className="dialog-actions"><button type="button" disabled={remove.isPending} onClick={close}>取消</button><button className="danger" disabled={remove.isPending || !password || confirmation !== phrase}>{remove.isPending ? '正在删除…' : '永久删除账户'}</button></div></form></Dialog>}
  </div>;
}
