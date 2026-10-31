import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto, NotificationPage } from '@research/contracts';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { Link } from '../../app/router';
import { Dialog } from '../../components/Dialog';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { reminderText as t, text } from '../../locales/zh-CN';
export function useNotificationStatus(userId: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: resourceKey('notificationStatus', userId), queryFn: ({ signal }) => apiRequest<NotificationPage>('/notifications?limit=1', { signal }), refetchInterval: 30000 });
  useEffect(() => {
    const stream = new EventSource('/api/v1/notifications/stream');
    const refresh = () => { void client.invalidateQueries({ queryKey: ['notificationStatus', userId] }); void client.invalidateQueries({ queryKey: ['notifications', userId] }); };
    stream.addEventListener('notifications', refresh);
    stream.onopen = refresh;
    return () => stream.close();
  }, [userId, client]);
  return query.data?.unreadCount ?? 0;
}
export function NotificationCenter({ userId, timezone, onClose }: { userId: string; timezone: string; onClose: () => void }) {
  const query = useInfiniteQuery({ queryKey: resourceKey('notifications', userId), initialPageParam: null as string | null, queryFn: ({ pageParam, signal }) => apiRequest<NotificationPage>(`/notifications?limit=30${pageParam ? `&cursor=${pageParam}` : ''}`, { signal }), getNextPageParam: page => page.nextCursor ?? undefined, refetchInterval: 30000 });
  const change = useResourceWrite<{ id: string; action: 'read' | 'snooze' }, NotificationDto>(userId, (input, key) => writeApi(`/notifications/${input.id}/${input.action}`, 'POST', input.action === 'read' ? {} : { minutes: 10 }, key));
  const format = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <Dialog variant="drawer" title={text.notifications} onClose={onClose}>
    <div className="notification-toolbar"><span>{t.unread} {query.data?.pages[0]?.unreadCount ?? 0}</span><button type="button" onClick={() => void query.refetch()}>{t.refresh}</button></div>
    <p className="help">{t.centerHelp}</p>
    {query.isPending && <p role="status">{t.loading}</p>}{query.isError && <p className="error" role="alert">{query.error.message}</p>}
    {!query.isPending && !query.isError && !items.length && <p className="notification-empty">{t.empty}</p>}
    {change.isError && <p className="error" role="alert">{change.error.message}</p>}
    <ul className="notification-list">{items.map(item => <li key={item.id} className={item.readAt ? 'notification-read' : ''}><div><Link href={item.href} onClick={onClose}>{item.title}</Link><p>{item.body}</p><time dateTime={item.createdAt}>{format(item.createdAt)}</time>{item.snoozedUntil && <p className="help">{t.snoozedUntil} {format(item.snoozedUntil)}</p>}</div><div className="notification-actions">{!item.readAt && <button type="button" disabled={change.isPending} onClick={() => change.mutate({ id: item.id, action: 'read' })}>{t.read}</button>}{item.reminderId && !item.snoozedUntil && <button type="button" disabled={change.isPending} onClick={() => change.mutate({ id: item.id, action: 'snooze' })}>{t.snooze}</button>}</div></li>)}</ul>
    {query.hasNextPage && <button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t.more}</button>}
  </Dialog>;
}
