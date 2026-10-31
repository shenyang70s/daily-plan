export const taskCategories = ['experiment', 'paper_reading', 'learning', 'research', 'meeting_prep', 'personal'] as const;
export const primaryPages = ['today', 'inbox', 'tasks', 'calendar', 'submissions'] as const;
export const settingsSections = ['general', 'notifications', 'ai', 'integrations', 'account'] as const;
export type PrimaryPage = typeof primaryPages[number];
export type SettingsSection = typeof settingsSections[number];
export type Route = { page: PrimaryPage; resourceId?: string; resourceKind?: 'event' | 'block'; taskType?: typeof taskCategories[number] | 'other'; date?: string }
  | { page: 'settings'; section: SettingsSection }
  | { page: 'notFound' };

export function resolveRoute(pathname: string): Route {
  const [rawPath = '/', rawQuery = ''] = pathname.split('?');
  const path = rawPath.replace(/\/$/, '') || '/', query = new URLSearchParams(rawQuery);
  const type = query.get('type'), date = query.get('date');
  if (path === '/tasks' && [...taskCategories, 'other'].some(item => item === type)) return { page: 'tasks', taskType: type as typeof taskCategories[number] | 'other' };
  if (path === '/calendar' && date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date) return { page: 'calendar', date };
  if (path === '/') return { page: 'today' };
  for (const page of primaryPages) {
    if (path === `/${page}`) return { page };
  }
  const calendar = /^\/calendar\/(events|blocks)\/([^/]+)$/.exec(path);
  if (calendar) {
    try {
      const resourceId = decodeURIComponent(calendar[2]!);
      if (resourceId.includes('/')) return { page: 'notFound' };
      return { page: 'calendar', resourceId, resourceKind: calendar[1] === 'events' ? 'event' : 'block' };
    } catch { return { page: 'notFound' }; }
  }
  const detail = /^\/(tasks|submissions)\/([^/]+)$/.exec(path);
  if (detail) {
    try {
      const resourceId = decodeURIComponent(detail[2]!);
      if (resourceId.includes('/')) return { page: 'notFound' };
      return { page: detail[1] as 'tasks' | 'submissions', resourceId };
    } catch { return { page: 'notFound' }; }
  }
  if (path === '/settings') return { page: 'settings', section: 'general' };
  for (const section of settingsSections) {
    if (path === `/settings/${section}`) return { page: 'settings', section };
  }
  return { page: 'notFound' };
}
