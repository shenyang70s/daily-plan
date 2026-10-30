export const primaryPages = ['today', 'inbox', 'tasks', 'calendar', 'submissions'] as const;
export const settingsSections = ['general', 'notifications', 'ai', 'integrations', 'account'] as const;
export type PrimaryPage = typeof primaryPages[number];
export type SettingsSection = typeof settingsSections[number];
export type Route = { page: PrimaryPage; resourceId?: string }
  | { page: 'settings'; section: SettingsSection }
  | { page: 'notFound' };

export function resolveRoute(pathname: string): Route {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return { page: 'today' };
  for (const page of primaryPages) {
    if (path === `/${page}`) return { page };
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
