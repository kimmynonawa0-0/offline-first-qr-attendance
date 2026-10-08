import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { createLocalRepository } from './local-repository';

const Context = createContext(null);
export const useApp = () => useContext(Context);

export function AppProvider({ children }) {
  const [repository] = useState(createLocalRepository);
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);
  const [adminSession, setAdminSessionState] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adminAuthIssue, setAdminAuthIssue] = useState('');
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [next, savedSession] = await Promise.all([
        repository.load(), Platform.OS === 'web' ? null : SecureStore.getItemAsync('norwescan-admin-session'),
      ]);
      setData(next);
      setAdminSessionState(savedSession ? JSON.parse(savedSession) : null);
    }
    catch { setError('Could not open local data. Your saved data has not been overwritten. Please retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    Promise.all([repository.load(), Platform.OS === 'web' ? null : SecureStore.getItemAsync('norwescan-admin-session')]).then(([next, savedSession]) => {
      if (active) { setData(next); setAdminSessionState(savedSession ? JSON.parse(savedSession) : null); setLoading(false); }
    }).catch(() => {
      if (active) {
        setError('Could not open local data. Your saved data has not been overwritten. Please retry.');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [repository]);
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
  async function setAdminSession(session) {
    if (Platform.OS !== 'web') await SecureStore.setItemAsync('norwescan-admin-session', JSON.stringify(session));
    setAdminSessionState(session);
  }
  async function clearAdminSession() {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('norwescan-admin-session');
    setAdminSessionState(null);
  }
  return <Context.Provider value={{ data, user, setUser, adminSession, setAdminSession, clearAdminSession, adminAuthIssue, setAdminAuthIssue, online, notice, setNotice, loading, error, load, update }}>{children}</Context.Provider>;
}
