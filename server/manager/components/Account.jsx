import { useState } from 'react';
import { api } from '../api.js';
import { CopyBox, PasswordField, Status } from './ui.jsx';

export function AccountPage({ token, account, onPasswordChanged, notify }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  async function changePassword(event) {
    event.preventDefault();
    if (passwordBusy) return;
    setPasswordBusy(true);
    setPasswordError('');
    try {
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match.');
      const result = await api('/auth/admin/password', {
        token,
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      if (!result.sessionToken) throw new Error('The server did not issue a replacement session.');
      onPasswordChanged(result.sessionToken);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('Password changed successfully.');
    } catch (changeError) {
      setPasswordError(changeError.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  async function createRecoveryCode() {
    if (recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      const result = await api('/auth/admin/recovery-code', { token, method: 'POST', body: {} });
      if (!result.recoveryCode) throw new Error('The server did not return a recovery code.');
      setRecoveryCode(result.recoveryCode);
      notify('Recovery code created. Copy it now; it replaces any previous code.');
    } catch (codeError) {
      setRecoveryError(codeError.message);
    } finally {
      setRecoveryBusy(false);
    }
  }

  return <section className="panel">
    <h1>Manager account security</h1>
    <h2>Change password</h2>
    <p>Confirm your current password and choose a new password with at least 12 characters.</p>
    <form onSubmit={changePassword}>
      <PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
      <PasswordField label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={12} />
      <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" minLength={12} />
      <div className="toolbar"><button type="submit" disabled={passwordBusy}>{passwordBusy ? 'Saving…' : 'Change password'}</button></div>
      <Status message={passwordError ? { text: passwordError, error: true } : null} />
    </form>

    <h2>Recovery code</h2>
    <p>Create a one-time code and store it somewhere private and offline. Creating a new code replaces the old one. It is shown only once.</p>
    <div className="toolbar"><button type="button" className="secondary" disabled={recoveryBusy} onClick={createRecoveryCode}>{recoveryBusy ? 'Creating…' : recoveryCode ? 'Create a new recovery code' : 'Create recovery code'}</button></div>
    {recoveryCode && <>
      <CopyBox value={recoveryCode} />
      <p className="muted">Signed in as {account?.name || 'System Manager'} ({account?.id || 'manager'}). Save this code offline now; it will not be shown again after you leave or replace it.</p>
    </>}
    <Status message={recoveryError ? { text: recoveryError, error: true } : null} />
  </section>;
}
