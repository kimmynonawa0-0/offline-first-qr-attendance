import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { LoginScreen, RecoveryScreen, FirstPasswordScreen } from './components/Login.jsx';
import { OverviewPage } from './components/Overview.jsx';
import { RosterPage } from './components/Roster.jsx';
import { StudentsPage } from './components/Students.jsx';
import { OrganizersPage } from './components/Organizers.jsx';
import { EventsPage } from './components/Events.jsx';
import { AttendancePage } from './components/Attendance.jsx';
import { AccountPage } from './components/Account.jsx';
import { Spinner } from './components/ui.jsx';

const TOKEN_KEY = 'manager-token';
const ACCOUNT_KEY = 'manager-account';
const PAGES = [
  ['overview', 'Overview'],
  ['roster', 'Roster'],
  ['students', 'Students'],
  ['organizers', 'Organizers'],
  ['events', 'Events'],
  ['attendance', 'Attendance'],
  ['account', 'Account'],
];

function readAccount() {
  try {
    const value = sessionStorage.getItem(ACCOUNT_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeSession(token, account) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
  if (account) sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  else sessionStorage.removeItem(ACCOUNT_KEY);
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [account, setAccount] = useState(readAccount);
  const [stage, setStage] = useState(() => sessionStorage.getItem(TOKEN_KEY) ? 'loading' : 'login');
  const [pending, setPending] = useState(null);
  const [loginMessage, setLoginMessage] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [overview, setOverview] = useState(null);
  const [page, setPage] = useState('overview');
  const [notice, setNotice] = useState(null);

  const notify = useCallback((text, error = false) => setNotice({ text, error }), []);

  const clearSession = useCallback((message = '') => {
    writeSession(null, null);
    setToken(null);
    setAccount(null);
    setOverview(null);
    setPending(null);
    setStage('login');
    setLoginMessage(message);
  }, []);

  const loadOverview = useCallback(async activeToken => {
    const data = await api('/management/overview', { token: activeToken });
    setOverview(data);
    return data;
  }, []);

  useEffect(() => {
    if (stage !== 'loading') return undefined;
    if (!token) {
      setStage('login');
      return undefined;
    }
    let live = true;
    loadOverview(token)
      .then(() => { if (live) setStage('app'); })
      .catch(error => {
        if (!live) return;
        clearSession(error.status === 401 ? 'Your session expired. Sign in again.' : error.message);
      });
    return () => { live = false; };
  }, [stage, token, loadOverview, clearSession]);

  const refresh = useCallback(async () => {
    try {
      await loadOverview(token);
    } catch (error) {
      if (error.status === 401) {
        clearSession('Your session expired. Sign in again.');
      } else {
        notify(error.message, true);
      }
      throw error;
    }
  }, [token, loadOverview, clearSession, notify]);

  async function login(nextAccount, nextToken) {
    if (nextAccount.mustChangePassword) {
      setPending({ account: nextAccount, token: nextToken });
      setLoginMessage('');
      setStage('password');
      return;
    }
    writeSession(nextToken, nextAccount);
    setToken(nextToken);
    setAccount(nextAccount);
    setLoginMessage('');
    setLoginUsername('');
    setStage('loading');
    setPage('overview');
  }

  function firstPasswordComplete(nextToken) {
    const nextAccount = { ...pending.account, mustChangePassword: false };
    setPending(null);
    writeSession(nextToken, nextAccount);
    setToken(nextToken);
    setAccount(nextAccount);
    setStage('loading');
  }

  async function logout() {
    try {
      if (token) await api('/auth/logout', { token, method: 'POST', body: {} });
    } catch {
      // The local session is cleared even if the server is unreachable.
    }
    clearSession('');
  }

  const body = (() => {
    if (stage === 'loading') return <div className="panel login"><Spinner label="Loading management data…" /></div>;
    if (stage === 'login') return <LoginScreen
      initialUsername={loginUsername}
      message={loginMessage}
      onLogin={login}
      onForgot={() => { setLoginMessage(''); setStage('recovery'); }}
    />;
    if (stage === 'recovery') return <RecoveryScreen
      initialUsername={loginUsername}
      onBack={() => setStage('login')}
      onRecovered={username => {
        setLoginUsername(username);
        setLoginMessage('Password reset. Sign in with your new password.');
        setStage('login');
      }}
    />;
    if (stage === 'password' && pending) return <FirstPasswordScreen
      account={pending.account}
      token={pending.token}
      currentPassword={pending.password}
      onComplete={firstPasswordComplete}
      onCancel={() => clearSession('Sign in again to continue.')}
    />;
    return <div className="app-shell">
      <nav className="tabs" aria-label="Management sections">
        {PAGES.map(([value, label]) => <button
          key={value}
          type="button"
          className={page === value ? '' : 'secondary'}
          onClick={() => { setPage(value); setNotice(null); }}
        >{label}</button>)}
        <button type="button" className="danger" onClick={logout}>Log out</button>
      </nav>
      {notice && <div className={`status notice${notice.error ? ' error' : ''}`} role="status">
        <span>{notice.text}</span>
        <button type="button" className="icon-button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
      </div>}
      {page === 'overview' && <OverviewPage overview={overview} />}
      {page === 'roster' && <RosterPage token={token} overview={overview} refresh={refresh} notify={notify} />}
      {page === 'students' && <StudentsPage token={token} overview={overview} refresh={refresh} notify={notify} />}
      {page === 'organizers' && <OrganizersPage token={token} overview={overview} refresh={refresh} notify={notify} />}
      {page === 'events' && <EventsPage token={token} overview={overview} refresh={refresh} notify={notify} />}
      {page === 'attendance' && <AttendancePage token={token} />}
      {page === 'account' && <AccountPage
        token={token}
        account={account}
        notify={notify}
        onPasswordChanged={nextToken => {
          writeSession(nextToken, account);
          setToken(nextToken);
        }}
      />}
    </div>;
  })();

  return <main className="shell">
    <header className="top">
      <div><div className="brand">NORWE<span>Scan</span></div><div className="tag">CCIS attendance management</div></div>
      <div className="tag account-tag">{account ? `${account.name || 'System Manager'} / ${account.id || ''}` : 'System manager'}</div>
    </header>
    {body}
  </main>;
}
