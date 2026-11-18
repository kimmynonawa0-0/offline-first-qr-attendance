import { useState } from 'react';
import { api } from '../api.js';
import { PasswordField } from './ui.jsx';

export function LoginScreen({ initialUsername = '', message = '', onLogin, onForgot }) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: { username: username.trim(), password, client: 'manager-web' },
      });
      if (result.account?.accessLevel !== 'manager' || !result.sessionToken) {
        throw new Error('This account is not a system manager.');
      }
      await onLogin(result.account, result.sessionToken, password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  return <section className="panel login">
    <p className="tag">SYSTEM MANAGER ACCESS</p>
    <h1>Manage attendance from one place.</h1>
    <p>Only the system-manager account can sign in here. Organizer credentials are not accepted.</p>
    {message && <div className="status" role="status">{message}</div>}
    <form onSubmit={submit}>
      <label htmlFor="login-username">Username</label>
      <input id="login-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className="toolbar">
        <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
        <button type="button" className="secondary" onClick={onForgot}>Forgot password?</button>
      </div>
      <div className={`status${error ? ' error' : ''}`} role="status">{error}</div>
    </form>
    <p className="tag">This console is restricted to the system manager. Organizers use the NORWEScan app.</p>
  </section>;
}

export function RecoveryScreen({ initialUsername = '', onBack, onRecovered }) {
  const [username, setUsername] = useState(initialUsername);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (password !== confirm) throw new Error('Passwords do not match.');
      await api('/auth/admin/password-reset', {
        method: 'POST',
        body: { username: username.trim(), recoveryCode: code, newPassword: password },
      });
      onRecovered(username.trim());
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setBusy(false);
      setCode('');
      setPassword('');
      setConfirm('');
    }
  }
  return <section className="panel login">
    <p className="tag">ACCOUNT RECOVERY</p>
    <h1>Reset manager password.</h1>
    <p>Use the one-time recovery code you saved while signed in. The code is consumed after a successful reset.</p>
    <form onSubmit={submit}>
      <label htmlFor="recovery-username">Username</label>
      <input id="recovery-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
      <label htmlFor="recovery-code">Recovery code</label>
      <input id="recovery-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck="false" required />
      <PasswordField label="New password, at least 12 characters" value={password} onChange={setPassword} autoComplete="new-password" minLength={12} />
      <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={12} />
      <div className="toolbar">
        <button type="submit" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
        <button type="button" className="secondary" onClick={onBack}>Back to sign in</button>
      </div>
      <div className={`status${error ? ' error' : ''}`} role="status">{error}</div>
    </form>
  </section>;
}

export function FirstPasswordScreen({ account, token, currentPassword, onComplete, onCancel }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (password.length < 12) throw new Error('Use at least 12 characters.');
      if (password !== confirm) throw new Error('Passwords do not match.');
      const result = await api('/auth/admin/password', {
        token,
        method: 'POST',
        body: { currentPassword, newPassword: password },
      });
      if (!result.sessionToken) throw new Error('The server did not issue a replacement session.');
      onComplete(result.sessionToken);
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setBusy(false);
      setPassword('');
      setConfirm('');
    }
  }
  return <section className="panel login">
    <p className="tag">FIRST SIGN IN</p>
    <h1>Set a private password.</h1>
    <p>Your system manager account is still using its temporary password.</p>
    <p className="muted">Signed in as {account?.name || 'System Manager'} ({account?.id || 'manager'}).</p>
    <form onSubmit={submit}>
      <PasswordField label="New password, at least 12 characters" value={password} onChange={setPassword} autoComplete="new-password" minLength={12} />
      <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={12} />
      <div className="toolbar">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Back to sign in</button>
      </div>
      <div className={`status${error ? ' error' : ''}`} role="status">{error}</div>
    </form>
  </section>;
}
