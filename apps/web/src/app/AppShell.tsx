import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NotificationCenter, useNotificationStatus } from '../features/notifications/NotificationCenter';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { text } from '../locales/zh-CN';
import { Link } from './router';
import { primaryPages, settingsSections } from './routes';
import type { Route } from './routes';

const destinations = [
  ...primaryPages.map(page => ({ href: `/${page}`, label: text.pageLabels[page] })),
  ...settingsSections.map(section => ({ href: `/settings/${section}`, label: `${text.pageLabels.settings} · ${text.sectionLabels[section]}` })),
];

function Search({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');
  const results = destinations.filter(item => item.label.toLocaleLowerCase('zh-CN').includes(search.trim().toLocaleLowerCase('zh-CN')));
  return <Dialog title={text.search} onClose={onClose}>
    <label className="sr-only" htmlFor="global-search">{text.search}</label>
    <input id="global-search" className="search-input" data-autofocus value={search} onChange={event => setSearch(event.target.value)} placeholder={text.searchPlaceholder} aria-describedby="search-help" />
    <p id="search-help" className="help">{text.searchHelp}</p>
    <ul className="search-results" aria-label={text.navigation}>{results.map(item => <li key={item.href}><Link href={item.href} onClick={onClose}>{item.label}<Icon name="arrow" /></Link></li>)}</ul>
    {results.length === 0 && <EmptyState icon="search" title={text.noSearchResults} description={text.noSearchResultsHelp} />}
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
  const [panel, setPanel] = useState<'search' | 'notifications' | 'navigation' | null>(null);
  const unread = useNotificationStatus(user.id);
  const content = useRef<HTMLElement>(null);
  const pageTitle = text.pageLabels[route.page];
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
        setPanel(current => current === 'search' ? null : 'search');
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const navigation = <nav className="shell-nav" aria-label={text.navigation}>
    {primaryPages.map(page => <Link key={page} href={`/${page}`} aria-current={route.page === page ? 'page' : undefined} onClick={() => setPanel(null)}><Icon name={page} /><span>{text.pageLabels[page]}</span></Link>)}
    <Link href="/settings/general" className="settings-link" aria-current={route.page === 'settings' ? 'page' : undefined} onClick={() => setPanel(null)}><Icon name="settings" /><span>{text.pageLabels.settings}</span></Link>
  </nav>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{text.skipToContent}</a>
    <aside className="shell-sidebar">
      <Link href="/today" className="shell-brand"><span className="brand-symbol">R</span><span>{text.brand}</span></Link>
      <div className="workspace-label"><span className="workspace-initial">{user.username.slice(0, 1).toUpperCase()}</span><div><strong>{text.workspaceName}</strong><span>{timezone}</span></div></div>
      {navigation}
      <div className="shell-profile"><div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div><div className="profile-info"><span title={user.username}>{user.username}</span><button type="button" disabled={loggingOut} onClick={onLogout}>{text.logout}</button></div></div>
    </aside>
    <div className="shell-body">
      <header className="shell-topbar">
        <button type="button" className="icon-button mobile-menu" aria-label={text.openMenu} aria-haspopup="dialog" onClick={() => setPanel('navigation')}><Icon name="menu" /></button>
        <div className="breadcrumbs"><span>{text.workspaceName}</span><span aria-hidden="true">/</span><strong>{pageTitle}</strong></div>
        <div className="topbar-actions">
          <button type="button" className="search-trigger" aria-haspopup="dialog" onClick={() => setPanel('search')}><Icon name="search" /><span>{text.search}</span><kbd>⌘ / Ctrl K</kbd></button>
          <button type="button" className="icon-button notification-trigger" aria-label={text.notifications} aria-haspopup="dialog" onClick={() => setPanel('notifications')}><Icon name="bell" />{unread > 0 && <span className="notification-badge" aria-label={`未读 ${unread}`}>{unread > 99 ? '99+' : unread}</span>}</button>
        </div>
      </header>
      <div className="shell-columns">
        <main ref={content} id="main-content" className="shell-content" tabIndex={-1}>
          {logoutError && <p className="error error-banner" role="alert">{logoutError}</p>}
          {children}
        </main>
        <aside className="shell-context" aria-label={text.contextTitle}>
          <p className="eyebrow">{text.eyebrow}</p><h2>{text.contextTitle}</h2><p>{text.contextDescription}</p>
          <dl><dt>{text.contextStatus}</dt><dd>{text.contextAvailable}</dd><dt>{text.contextNext}</dt><dd>{text.contextUpcoming}</dd></dl>
          <div className="context-footer">{text.footer}</div>
        </aside>
      </div>
    </div>
    {panel === 'search' && <Search onClose={() => setPanel(null)} />}
    {panel === 'notifications' && <NotificationCenter userId={user.id} timezone={timezone} onClose={() => setPanel(null)} />}
    {panel === 'navigation' && <Dialog title={text.navigation} onClose={() => setPanel(null)}>{navigation}<div className="mobile-profile"><span>{user.username}</span><button type="button" disabled={loggingOut} onClick={onLogout}>{text.logout}</button></div></Dialog>}
  </div>;
}
