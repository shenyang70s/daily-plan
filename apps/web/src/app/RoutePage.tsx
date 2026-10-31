import { PushSettings } from '../features/notifications/PushSettings';
import { GeneralSettings } from '../features/settings/GeneralSettings';
import type { Preferences } from '../features/settings/GeneralSettings';
import { EmptyState } from '../components/EmptyState';
import { text } from '../locales/zh-CN';
import { Dialog } from '../components/Dialog';
import { Link, navigate } from './router';
import { settingsSections } from './routes';
import type { Route } from './routes';
import { lazy, Suspense } from 'react';
import { TasksPage } from '../features/tasks/TasksPage';
import { TaskDetailPanel } from '../features/tasks/TaskDetailPanel';

const SubmissionsPage = lazy(() => import('../features/submissions/SubmissionsPage').then(module => ({ default: module.SubmissionsPage })));
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage').then(module => ({ default: module.CalendarPage })));

export function RoutePage({ route, userId, username, preferences, onSaved }: { route: Route; userId: string; username: string; preferences: Preferences; onSaved: () => void }) {
  if (route.page === 'notFound') return <EmptyState title={text.notFoundTitle} description={text.notFoundHelp}><Link className="button-link" href="/today">{text.backToToday}</Link></EmptyState>;
  if (route.page === 'tasks' && route.resourceId) return <><TasksPage userId={userId} timezone={preferences.timezone} view="all" /><Dialog variant="drawer" title={text.taskDetail} onClose={() => navigate('/tasks')}><TaskDetailPanel embedded key={route.resourceId} id={route.resourceId} userId={userId} timezone={preferences.timezone} /></Dialog></>;
  if (route.page === 'today' || route.page === 'inbox' || route.page === 'tasks') return <TasksPage key={route.page} initialType={route.page === 'tasks' ? route.taskType : undefined} userId={userId} timezone={preferences.timezone} view={route.page === 'tasks' ? 'all' : route.page} />;
  if (route.page === 'calendar') return <Suspense fallback={<p role="status">{text.checking}</p>}><CalendarPage key={route.date} initialDate={route.date} userId={userId} timezone={preferences.timezone} selection={route.resourceId && route.resourceKind ? { kind: route.resourceKind, id: route.resourceId } : undefined} /></Suspense>;
  if (route.page === 'submissions') return <Suspense fallback={<p role="status">{text.checking}</p>}><SubmissionsPage userId={userId} timezone={preferences.timezone} id={route.resourceId} /></Suspense>;
  if (route.page === 'settings') return <>
    <div className="page-heading"><p className="eyebrow">{text.eyebrow}</p><h1>{text.pageLabels.settings}</h1></div>
    <nav className="settings-tabs" aria-label={text.settingsNavigation}>{settingsSections.map(section => <Link key={section} href={`/settings/${section}`} aria-current={route.section === section ? 'page' : undefined}>{text.sectionLabels[section]}</Link>)}</nav>
    {['general', 'notifications', 'ai'].includes(route.section) ? <><GeneralSettings key={`${userId}:${route.section}`} section={route.section as 'general' | 'notifications' | 'ai'} preferences={preferences} onSaved={onSaved} />{route.section === 'notifications' && <PushSettings key={userId} userId={userId} />}</>
      : route.section === 'integrations' ? <EmptyState icon="settings" title={text.integrationsPending} description={text.integrationsHelp} />
      : <><div className="account-summary"><span>{text.currentAccount}</span><strong>{username}</strong></div><EmptyState icon="settings" title={text.accountDataPending} description={text.accountDataHelp} /></>}
  </>;
  return null;
}
