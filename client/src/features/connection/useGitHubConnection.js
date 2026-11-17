import { useCallback, useEffect, useState } from 'react';
import { loadGitHubSession, logoutGitHub, setEmailNotifications } from '../dashboard/analysis.api.js';

export default function useGitHubConnection() {
  const [session, setSession] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [connectionBusy, setConnectionBusy] = useState(false);
  const refreshSession = useCallback(async () => {
    setConnectionBusy(true);
    setConnectionError('');
    try {
      setSession(await loadGitHubSession());
    } catch (error) {
      setConnectionError(error.message);
    } finally {
      setConnectionBusy(false);
    }
  }, []);
  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);
  async function signOut() {
    setConnectionBusy(true);
    setConnectionError('');
    try {
      await logoutGitHub();
      setSession((previous) => ({ ...previous, authenticated: false, login: null, userId: null }));
    } catch (error) {
      setConnectionError(error.message);
    } finally {
      setConnectionBusy(false);
    }
  }
  async function changeEmailPreference(enabled) {
    setConnectionBusy(true);
    setConnectionError('');
    try {
      const result = await setEmailNotifications(enabled);
      setSession((previous) => ({ ...previous, emailNotifications: result.enabled }));
    } catch (error) {
      setConnectionError(error.message);
    } finally {
      setConnectionBusy(false);
    }
  }
  return { session, connectionError, connectionBusy, refreshSession, signOut, changeEmailPreference };
}
