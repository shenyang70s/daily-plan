import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NotificationCenter, useNotificationStatus } from '../features/notifications/NotificationCenter';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { useQuery } from '@tanstack/react-query';
import type { CursorPage, TaskDto } from '@research/contracts';
import { apiRequest } from '../lib/api-client';
import { resourceKey } from './query-client';
import { text, aiText, tasksText } from '../locales/zh-CN';
import { Link } from './router';
import { primaryPages, settingsSections, taskCategories } from './routes';
import type { AiScope } from '../features/ai/entry';
import type { Route } from './routes';

const TodayContext = lazy(() => import('../features/tasks/TodayContext').then(module => ({ default: module.TodayContext })));
const CommandBar = lazy(() => import('../features/ai/CommandBar').then(module => ({ default: module.CommandBar })));

const destinations = [
  ...primaryPages.map(page => ({ href: `/${page}`, label: text.pageLabels[page] })),
  ...settingsSections.map(section => ({ href: `/settings/${section}`, label: `${text.pageLabels.settings} · ${text.sectionLabels[section]}` })),
];

function Search({ onClose, userId, initialInput, scope, autoSubmit }: { onClose: () => void; userId: string; initialInput: string; scope?: AiScope | undefined; autoSubmit?: boolean }) {
  const [mode, setMode] = useState<'ai' | 'navigation'>('ai');
  const [search, setSearch] = useState('');
  const results = destinations.filter(item => item.label.toLocaleLowerCase('zh-CN').includes(search.trim().toLocaleLowerCase('zh-CN')));
  return <Dialog title="AI 助手" onClose={onClose}>
    <div className="command-tabs"><button type="button" aria-pressed={mode === 'ai'} onClick={() => setMode('ai')}>{aiText.tab}</button><button type="button" aria-pressed={mode === 'navigation'} onClick={() => setMode('navigation')}>{aiText.navigation}</button></div>
    {mode === 'ai' ? <Suspense fallback={<p role="status">{text.checking}</p>}><CommandBar initialInput={initialInput} autoSubmit={autoSubmit ?? false} scope={scope} userId={userId} onClose={onClose} /></Suspense> : <>
    <label className="sr-only" htmlFor="global-search">{text.search}</label>
    <input id="global-search" className="search-input" data-autofocus value={search} onChange={event => setSearch(event.target.value)} placeholder={text.searchPlaceholder} aria-describedby="search-help" />
    <p id="search-help" className="help">{text.searchHelp}</p>
    <ul className="search-results" aria-label={text.navigation}>{results.map(item => <li key={item.href}><Link href={item.href} onClick={onClose}>{item.label}<Icon name="arrow" /></Link></li>)}</ul>
    {results.length === 0 && <EmptyState icon="search" title={text.noSearchResults} description={text.noSearchResultsHelp} />}
    </>}
  </Dialog>;
}

interface AppShellProps {
  user: { id: string; username: string };
  timezone: string;
  route: Route;
  pathname: string;
  onLogout: () => void;
  loggingOut: boolean;
  logoutError: string | undefined;
  children: ReactNode;
}

export function AppShell({ user, timezone, route, pathname, onLogout, loggingOut, logoutError, children }: AppShellProps) {
  const [panel, setPanel] = useState<'search' | 'task-ai' | 'notifications' | 'navigation' | null>(null);
  const [commandInput, setCommandInput] = useState(''), [commandScope, setCommandScope] = useState<AiScope | undefined>(), [commandAuto, setCommandAuto] = useState(false);
  const routeScope: AiScope | undefined = 'resourceId' in route && route.resourceId ? route.page === 'tasks' ? { type: 'task', id: route.resourceId } : route.page === 'submissions' ? { type: 'submission', id: route.resourceId } : route.page === 'calendar' ? { type: route.resourceKind === 'event' ? 'event' : 'block', id: route.resourceId } : undefined : undefined;
  const inbox = useQuery({ queryKey: resourceKey('inboxCount', user.id), queryFn: ({ signal }) => apiRequest<CursorPage<TaskDto>>('/tasks?view=inbox&limit=100', { signal }) });
  const unread = useNotificationStatus(user.id);
  const content = useRef<HTMLElement>(null);
  const pageTitle = route.page === 'tasks' && route.taskType ? tasksText.types[route.taskType] : text.pageLabels[route.page];
  const isToday = route.page === 'today';
  const title = route.page === 'settings' ? text.sectionLabels[route.section] : 'resourceId' in route && route.resourceId ? route.page === 'tasks' ? text.taskDetail : route.page === 'calendar' ? text.pageLabels.calendar : text.submissionDetail : pageTitle;
  useEffect(() => {
    document.title = `${text.brand} · ${title}`;
    content.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    setPanel(null);
  }, [pathname, title]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandInput(''); setCommandScope(routeScope); setCommandAuto(false);
        setPanel(current => current === 'search' ? null : 'search');
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [pathname]);
  useEffect(() => {
    const openCommand = (event: Event) => { setCommandInput(typeof (event as CustomEvent).detail === 'string' ? (event as CustomEvent<string>).detail : ''); setPanel('task-ai'); };
    window.addEventListener('research:plan-task', openCommand);
    return () => window.removeEventListener('research:plan-task', openCommand);
  }, []);
  useEffect(() => {
    const open = (event: Event) => { const detail = (event as CustomEvent<{ input?: string; scope?: AiScope; autoSubmit?: boolean }>).detail; setCommandInput(detail?.input ?? ''); setCommandScope(detail?.scope); setCommandAuto(detail?.autoSubmit ?? !!detail?.input?.trim()); setPanel('search'); };
    window.addEventListener('research:open-ai', open); return () => window.removeEventListener('research:open-ai', open);
  }, []);
  const navigation = <nav className="shell-nav" aria-label={text.navigation}>
    {primaryPages.map(page => <Link key={page} href={`/${page}`} aria-current={route.page === page && !(route.page === 'tasks' && route.taskType) ? 'page' : undefined} onClick={() => setPanel(null)}><Icon name={page} /><span>{text.pageLabels[page]}</span>{page === 'inbox' && inbox.data && <span className="nav-count">{inbox.data.items.length}{inbox.data.nextCursor ? '+' : ''}</span>}</Link>)}
    <p className="nav-label">任务分类</p>
    {taskCategories.map(type => <Link key={type} className="category-link" href={`/tasks?type=${type}`} aria-current={route.page === 'tasks' && route.taskType === type ? 'page' : undefined} onClick={() => setPanel(null)}><i className="category-dot" /><span>{tasksText.types[type]}</span></Link>)}
  </nav>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{text.skipToContent}</a>
    <aside className="shell-sidebar">
      <Link href="/today" className="shell-brand"><span className="brand-symbol"><Icon name="atom" /></span><span>{text.brand}<b>.</b></span></Link>
      <div className="workspace-label"><span className="workspace-initial"><Icon name="folder" /></span><div><strong>我的研究空间</strong><span>Personal workspace</span></div></div>
      {navigation}
      <Link href="/settings/general" className="sidebar-settings"><Icon name="settings" /><span>设置与偏好</span></Link>
      <div className="shell-profile"><div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div><div className="profile-info"><span title={user.username}>{user.username}</span><button type="button" disabled={loggingOut} onClick={onLogout}>{text.logout}</button></div></div>
    </aside>
    <div className="shell-body">
      <header className="shell-topbar">
        <button type="button" className="icon-button mobile-menu" aria-label={text.openMenu} aria-haspopup="dialog" onClick={() => setPanel('navigation')}><Icon name="menu" /></button>
        <div className="breadcrumbs"><span>个人空间</span><span aria-hidden="true">›</span><strong>{pageTitle}</strong></div>
        <div className="topbar-actions">
          <button type="button" className="search-trigger" aria-haspopup="dialog" onClick={() => { setCommandInput(''); setCommandScope(routeScope); setCommandAuto(false); setPanel('search'); }}><Icon name="search" /><span>告诉 AI 你的目标</span><kbd>⌘ K</kbd></button>
          <button type="button" className="icon-button notification-trigger" aria-label={text.notifications} aria-haspopup="dialog" onClick={() => setPanel('notifications')}><Icon name="bell" />{unread > 0 && <span className="notification-badge" aria-label={`未读 ${unread}`}>{unread > 99 ? '99+' : unread}</span>}</button>
          <Link className="topbar-avatar avatar" href="/settings/account" aria-label="账户与设置">{user.username.slice(0, 1).toUpperCase()}</Link>
        </div>
      </header>
      <div className={`shell-columns${isToday ? ' today-columns' : ' full-columns'}`}>
        <main ref={content} id="main-content" className="shell-content" tabIndex={-1}>
          {logoutError && <p className="error error-banner" role="alert">{logoutError}</p>}
          {children}
        </main>
        {isToday && <Suspense fallback={<aside className="shell-context" aria-label="日历和近期安排" />}><TodayContext userId={user.id} timezone={timezone} onNotifications={() => setPanel('notifications')} /></Suspense>}
      </div>
    </div>
    {panel === 'task-ai' && <Dialog title="AI 安排任务" onClose={() => setPanel(null)}><Suspense fallback={<p role="status">{text.checking}</p>}><CommandBar userId={user.id} initialInput={commandInput} intent="capture" autoSubmit onClose={() => setPanel(null)} /></Suspense></Dialog>}
    {panel === 'search' && <Search scope={commandScope} autoSubmit={commandAuto} initialInput={commandInput} userId={user.id} onClose={() => setPanel(null)} />}
    {panel === 'notifications' && <NotificationCenter userId={user.id} timezone={timezone} onClose={() => setPanel(null)} />}
    {panel === 'navigation' && <Dialog title={text.navigation} onClose={() => setPanel(null)}>{navigation}<div className="mobile-profile"><span>{user.username}</span><button type="button" disabled={loggingOut} onClick={onLogout}>{text.logout}</button></div></Dialog>}
  </div>;
}
