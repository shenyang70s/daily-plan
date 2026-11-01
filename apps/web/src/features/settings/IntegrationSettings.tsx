import { useQuery } from '@tanstack/react-query';
import type { AiConfigDto, PushConfigDto } from '@research/contracts';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { ResourceOverview } from '../../components/ResourceOverview';
export function IntegrationSettings({ userId }: { userId: string }) {
  const ai = useQuery({ queryKey: resourceKey('aiConfig', userId), queryFn: ({ signal }) => apiRequest<AiConfigDto>('/ai/config', { signal }) });
  const push = useQuery({ queryKey: resourceKey('pushConfig', userId), queryFn: ({ signal }) => apiRequest<PushConfigDto>('/push/config', { signal }) });
  return <section className="account-data-section"><h2>接入状态</h2><ResourceOverview fields={[
    ['DeepSeek', ai.isPending ? '正在检查…' : ai.isError ? '读取失败' : !ai.data.configured ? '服务端未配置' : ai.data.enabled ? `已配置 · ${ai.data.model}` : `已配置 · ${ai.data.model} · 当前账户已关闭 AI`],
    ['会议来源', 'CCF-Deadlines 已接入，按需读取相关 CCF A 类会议并保留来源快照'],
    ['浏览器推送', push.isPending ? '正在检查…' : push.isError ? '读取失败' : push.data.enabled ? '服务端已配置；设备授权与订阅状态请在通知设置中查看' : '服务端未配置，应用内通知仍可使用'],
    ['外部日历同步', '尚未接入'],
  ]} /><p className="help">此页展示实际接入情况。会议抓取和推送服务的配置状态不代表远端服务当前一定可达。</p>{(ai.isError || push.isError) && <p className="error" role="alert">部分状态读取失败。<button type="button" onClick={() => { void ai.refetch(); void push.refetch(); }}>重试</button></p>}</section>;
}
