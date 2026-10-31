/* Push-only worker: no fetch handler and no application-data cache. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
function safePath(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '/tasks', self.location.origin);
    if (url.origin === self.location.origin && /^\/(?:tasks(?:\/[^/?#]+)?|today|submissions(?:\/[^/?#]+)?|calendar(?:\/events\/[^/?#]+)?)$/.test(url.pathname)) return url.pathname;
  } catch {}
  return '/tasks';
}
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const tag = typeof data.tag === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.tag) ? data.tag : 'research-reminder';
  event.waitUntil(self.registration.showNotification('Research Tasks', {
    body: '有一条研究提醒，打开研究空间查看详情。', tag,
    data: { href: safePath(data.href) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(safePath(event.notification.data?.href), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
        const navigated = await client.navigate(url);
        if (navigated) return navigated.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
