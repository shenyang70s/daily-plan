import { GeneralSettings } from '../features/settings/GeneralSettings';
import type { Preferences } from '../features/settings/GeneralSettings';
import { EmptyState } from '../components/EmptyState';
import { text } from '../locales/zh-CN';
import { Link } from './router';
import { settingsSections } from './routes';
import type { Route } from './routes';
import { TasksPage } from '../features/tasks/TasksPage';
import { TaskDetailPanel } from '../features/tasks/TaskDetailPanel';

export function RoutePage({ route, userId, username, preferences, onSaved }: { route: Route; userId: string; username: string; preferences: Preferences; onSaved: () => void }) {
  if (route.page === 'notFound') return <EmptyState title={text.notFoundTitle} description={text.notFoundHelp}><Link className="button-link" href="/today">{text.backToToday}</Link></EmptyState>;
  if (route.page === 'tasks' && route.resourceId) return <TaskDetailPanel key={route.resourceId} id={route.resourceId} userId={userId} timezone={preferences.timezone} />;
  if (route.page === 'today' || route.page === 'inbox' || route.page === 'tasks') return <TasksPage key={route.page} userId={userId} timezone={preferences.timezone} view={route.page === 'tasks' ? 'all' : route.page} />;
  if (route.page === 'settings') return <>
    <div className="page-heading"><p className="eyebrow">{text.eyebrow}</p><h1>{text.pageLabels.settings}</h1></div>
    <nav className="settings-tabs" aria-label={text.settingsNavigation}>{settingsSections.map(section => <Link key={section} href={`/settings/${section}`} aria-current={route.section === section ? 'page' : undefined}>{text.sectionLabels[section]}</Link>)}</nav>
    {['general', 'notifications', 'ai'].includes(route.section) ? <GeneralSettings key={`${userId}:${route.section}`} section={route.section as 'general' | 'notifications' | 'ai'} preferences={preferences} onSaved={onSaved} />
      : route.section === 'integrations' ? <EmptyState icon="settings" title={text.integrationsPending} description={text.integrationsHelp} />
      : <><div className="account-summary"><span>{text.currentAccount}</span><strong>{username}</strong></div><EmptyState icon="settings" title={text.accountDataPending} description={text.accountDataHelp} /></>}
  </>;
  const detail = !!route.resourceId;
  const title = detail ? text.submissionDetail : text.pageLabels[route.page];
  const calendar = route.page === 'calendar';
  const pendingTitle = detail ? text.detailPending : calendar ? text.calendarPending : text.submissionsPending;
  const description = detail ? text.detailHelp : calendar ? text.calendarHelp : text.submissionsHelp;
  return <>
    <div className="page-heading"><p className="eyebrow">{text.eyebrow}</p><h1>{title}</h1><p className="page-description">{text.pageDescriptions[route.page]}</p></div>
    <EmptyState icon={route.page} title={pendingTitle} description={description} />
  </>;
}
