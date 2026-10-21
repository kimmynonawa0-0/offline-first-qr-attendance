import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { createLocalRepository } from './local-repository';
import { ACTIVE_USER_KEY, persistActiveUser, restoreRememberedUser } from './offline-auth.mjs';
import { createIndexedDbStorage } from './indexeddb-storage.mjs';
import { persistWebSession, restoreWebSession } from './web-session.mjs';

const Context = createContext(null);
export const useApp = () => useContext(Context);

export function AppProvider({ children }) {
  const [repository] = useState(createLocalRepository);
  const [browserSessionStorage] = useState(() => Platform.OS === 'web' ? createIndexedDbStorage() : null);
  const [data, setData] = useState(null);
  const [user, setUserState] = useState(null);
  const [webCredential, setWebCredentialState] = useState(null);
  const [adminSession, setAdminSessionState] = useState(null);
  const [startupRoute, setStartupRoute] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adminAuthIssue, setAdminAuthIssue] = useState('');
  const [online, setOnline] = useState(null);
  const [loading, setLoading] = useState(true);
  function applyLoadedData(next, savedSession, savedUser) {
    let session = null;
    let marker = null;
    try { session = savedSession ? JSON.parse(savedSession) : null; } catch {}
    try { marker = savedUser ? JSON.parse(savedUser) : null; } catch {}
    const restored = Platform.OS === 'web'
      ? restoreWebSession(next, savedUser)
      : restoreRememberedUser(next, marker);
    setData(next);
    setAdminSessionState(session);
    setUserState(restored);
    setStartupRoute(restored ? restored.mustChangePassword ? 'change-password' : restored.role === 'admin' ? 'admin-home' : 'student-home' : null);
  }
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [next, savedSession, savedUser] = await Promise.all([
        repository.load(), Platform.OS === 'web' ? null : SecureStore.getItemAsync('norwescan-admin-session'),
        Platform.OS === 'web' ? browserSessionStorage.getItem(ACTIVE_USER_KEY) : SecureStore.getItemAsync(ACTIVE_USER_KEY),
      ]);
      applyLoadedData(next, savedSession, savedUser);
    }
    catch { setError('Could not open local data. Your saved data has not been overwritten. Please retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    Promise.all([repository.load(), Platform.OS === 'web' ? null : SecureStore.getItemAsync('norwescan-admin-session'),
      Platform.OS === 'web' ? null : SecureStore.getItemAsync(ACTIVE_USER_KEY)]).then(([next, savedSession, savedUser]) => {
      if (active) { applyLoadedData(next, savedSession, savedUser); setLoading(false); }
    }).catch(() => {
      if (active) {
        setError('Could not open local data. Your saved data has not been overwritten. Please retry.');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [repository, browserSessionStorage]);
  useEffect(() => NetInfo.addEventListener(state => setOnline(Boolean(state.isConnected && state.isInternetReachable !== false))), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function update(transform) {
    const next = await repository.update(transform);
    setData(next);
    return next;
  }
  async function setUser(account) {
    if (Platform.OS === 'web') {
      await persistWebSession(browserSessionStorage, account);
    } else {
      await persistActiveUser(SecureStore, account);
    }
    if (Platform.OS === 'web' && !account) setWebCredentialState(null);
    setUserState(account);
    setStartupRoute(null);
  }
  function setWebCredential(account, password) {
    if (Platform.OS !== 'web') return;
    setWebCredentialState(account && typeof password === 'string'
      ? { id: account.id, role: account.role, password }
      : null);
  }
  async function setAdminSession(session) {
    if (Platform.OS !== 'web') await SecureStore.setItemAsync('norwescan-admin-session', JSON.stringify(session));
    setAdminSessionState(session);
  }
  async function clearAdminSession() {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('norwescan-admin-session');
    setAdminSessionState(null);
  }
  function consumeStartupRoute() { setStartupRoute(null); }
  return <Context.Provider value={{ data, user, setUser, webCredential, setWebCredential, adminSession, setAdminSession, clearAdminSession, adminAuthIssue, setAdminAuthIssue, online, notice, setNotice, loading, error, load, update, startupRoute, consumeStartupRoute }}>{children}</Context.Provider>;
}
