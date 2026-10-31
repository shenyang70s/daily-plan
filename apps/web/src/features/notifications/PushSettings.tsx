import { useMutation, useQuery } from '@tanstack/react-query';
import type { PushConfigDto, PushStatusDto } from '@research/contracts';
import { resourceKey } from '../../app/query-client';
import { apiRequest } from '../../lib/api-client';
import { pushText as t } from '../../locales/zh-CN';
import { writeApi } from '../tasks/task-api';
function supported(): boolean { return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
async function endpointHash(endpoint: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))].map(value => value.toString(16).padStart(2, '0')).join(''); }
function bytes(key: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), value => value.charCodeAt(0)); }
async function localSubscription(): Promise<PushSubscription | null> { return supported() ? (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription() ?? null : null; }
export function PushSettings({ userId }: { userId: string }) {
  const query = useQuery({ queryKey: resourceKey('pushSettings', userId), queryFn: async ({ signal }) => {
    const config = await apiRequest<PushConfigDto>('/push/config', { signal });
    const subscription = await localSubscription();
    const status = subscription ? await apiRequest<PushStatusDto>(`/push/subscriptions?endpointHash=${await endpointHash(subscription.endpoint)}`, { signal }) : null;
    return { config, status, hasSubscription: !!subscription, permission: supported() ? Notification.permission : 'unsupported' };
  }, refetchInterval: 30000 });
  const change = useMutation({ mutationFn: async (action: 'enable' | 'disable') => {
    if (!supported()) throw new Error(t.unsupported);
    if (action === 'disable') {
      const subscription = await localSubscription();
      if (subscription) { await writeApi('/push/subscriptions', 'DELETE', { endpointHash: await endpointHash(subscription.endpoint) }, crypto.randomUUID()); await subscription.unsubscribe(); }
      return;
    }
    const config = query.data?.config;
    if (!config?.enabled || !config.publicKey) throw new Error(t.unconfigured);
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') throw new Error(t.denied);
    try {
      await navigator.serviceWorker.register('/push-sw.js', { scope: '/', updateViaCache: 'none' });
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (subscription?.options.applicationServerKey) {
        const oldKey = new Uint8Array(subscription.options.applicationServerKey), newKey = bytes(config.publicKey);
        if (oldKey.length !== newKey.length || oldKey.some((value, index) => value !== newKey[index])) { await subscription.unsubscribe(); subscription = null; }
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(config.publicKey) });
      await writeApi('/push/subscriptions', 'POST', subscription.toJSON(), crypto.randomUUID());
    } catch (error) { if (error instanceof DOMException) throw new Error(t.browserFailed); throw error; }
  }, onSuccess: () => query.refetch(), onError: () => { void query.refetch(); } });
  const data = query.data, active = data?.status?.active && data.permission === 'granted';
  return <section className="push-settings" aria-label={t.title}>
    <h2>{t.title}</h2><p className="help">{t.help}</p>
    {query.isPending && <p role="status">{t.loading}</p>}
    {query.isError && <p className="error" role="alert">{query.error.message}</p>}
    {data && <p role="status">{!supported() ? t.unsupported : !data.config.enabled ? t.unconfigured : data.permission === 'denied' ? t.denied : active ? t.active : t.inactive}</p>}
    {data?.status?.deliveryStatus && <p className="help">{t.delivery}：{t.states[data.status.deliveryStatus as keyof typeof t.states] ?? data.status.deliveryStatus}{data.status.lastErrorCode ? ` · ${t.deliveryError}` : ''}</p>}
    {change.isError && <p className="error" role="alert">{change.error.message}</p>}
    <div className="push-actions"><button type="button" disabled={change.isPending || query.isFetching} onClick={() => void query.refetch()}>{t.refresh}</button>{supported() && data?.config.enabled && !active && <button type="button" className="primary" disabled={change.isPending || data.permission === 'denied'} onClick={() => change.mutate('enable')}>{t.enable}</button>}{data?.hasSubscription && <button type="button" disabled={change.isPending} onClick={() => change.mutate('disable')}>{t.disable}</button>}</div>
  </section>;
}
