import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest, onSessionExpired, setCsrfToken } from '../lib/api-client';
import { SignInPage } from '../features/auth/SignInPage';
import type { Preferences } from '../features/settings/GeneralSettings';
import { ToastProvider } from '../components/Toast';
import { text } from '../locales/zh-CN';
import { useRoute } from './router';
import { AppShell } from './AppShell';
import { RoutePage } from './RoutePage';

interface Me { user: { id: string; username: string }; csrfToken: string; preferences: Preferences }

function SessionWorkspace() {
  const client = useQueryClient();
  const { route, pathname } = useRoute();
  const [sessionMessage, setSessionMessage] = useState('');
  const resetSession = useCallback(() => {
    setCsrfToken('');
    void client.cancelQueries();
    client.clear();
    client.setQueryData(['me'], null);
  }, [client]);
  useEffect(() => onSessionExpired(() => {
    resetSession();
    setSessionMessage(text.sessionExpired);
  }), [resetSession]);
  const me = useQuery({
    queryKey: ['me'], retry: false,
    queryFn: async ({ signal }) => {
      try {
        const result = await apiRequest<Me>('/me', { signal });
        setCsrfToken(result.csrfToken);
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setCsrfToken('');
          client.removeQueries({ predicate: query => query.queryKey[0] !== 'me' });
          return null;
        }
        throw error;
      }
    },
  });
  const logout = useMutation({ mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }), onSuccess: resetSession });
  if (me.isPending) return <main className="setup"><p role="status">{text.checking}</p></main>;
  if (!me.data && me.isError) return <main className="setup"><h1>{text.unavailable}</h1><button onClick={() => void me.refetch()}>{text.retry}</button></main>;
  if (!me.data) return <SignInPage message={sessionMessage} onSignedIn={() => { setSessionMessage(''); void client.invalidateQueries({ queryKey: ['me'] }); }} />;
  return <ToastProvider key={me.data.user.id}><AppShell user={me.data.user} timezone={me.data.preferences.timezone} route={route} pathname={pathname}
    onLogout={() => logout.mutate()} loggingOut={logout.isPending} logoutError={logout.isError ? logout.error.message : undefined}>
    {me.isError && <p className="error" role="alert">{text.unavailable} <button onClick={() => void me.refetch()}>{text.retry}</button></p>}
    <RoutePage onDeleted={resetSession} route={route} userId={me.data.user.id} username={me.data.user.username} preferences={me.data.preferences} onSaved={() => void client.invalidateQueries({ queryKey: ['me'] })} />
  </AppShell></ToastProvider>;
}

export function App() { return <SessionWorkspace />; }
