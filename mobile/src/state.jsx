import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createRepository } from './storage.mjs';

const Context = createContext(null);
export const useApp = () => useContext(Context);

export function AppProvider({ children }) {
  const [repository] = useState(() => createRepository(AsyncStorage));
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError('');
    try { setData(await repository.load()); }
    catch { setError('Could not open local data. Your saved data has not been overwritten. Please retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    repository.load().then(next => {
      if (active) { setData(next); setLoading(false); }
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
  return <Context.Provider value={{ data, user, setUser, online, notice, setNotice, loading, error, load, update }}>{children}</Context.Provider>;
}
