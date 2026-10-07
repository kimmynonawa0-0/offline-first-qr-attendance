import { useRef, useState } from 'react';
import { Button, Card, ErrorText, Field, Heading, LinkButton, ModalFrame, Muted, UniversityBanner } from './ui';
import { cacheRemoteStudent, changePassword, login } from './model.mjs';
import { changeStudentPasswordRemotely, loginStudentRemotely } from './remote-sync.mjs';
import { useApp } from './state';

export function LoginScreen({ onLogin }) {
  const { data, update } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return <>
    <UniversityBanner />
    <Card>
      <Field label="Student ID" autoCapitalize="none" autoCorrect={false} value={identifier} onChangeText={setIdentifier} />
      <Field label="Password" value={password} onChangeText={setPassword} password />
      <LinkButton onPress={() => setHelp(true)}>Forgot password?</LinkButton>
      <ErrorText>{error}</ErrorText>
      <Button disabled={busy} onPress={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        try {
          const localAdmin = data.admins.some(account => account.id === identifier.trim());
          if (localAdmin) {
            const account = login(data, identifier, password);
            setPassword(''); onLogin(account); return;
          }
          const apiUrl = process.env.EXPO_PUBLIC_API_URL;
          if (apiUrl) {
            try {
              const remote = await loginStudentRemotely(identifier, password, apiUrl);
              const next = await update(current => cacheRemoteStudent(current, remote, password));
              setPassword(''); onLogin(login(next, remote.id, password)); return;
            } catch (remoteError) {
              if (!remoteError.message.startsWith('Could not reach the attendance server.')) throw remoteError;
              try { const account = login(data, identifier, password); setPassword(''); onLogin(account); return; }
              catch { throw remoteError; }
            }
          }
          const account = login(data, identifier, password);
          setPassword(''); onLogin(account);
        } catch (e) { setError(e.message); }
        finally { lock.current = false; setBusy(false); }
      }}>{busy ? 'Signing in...' : 'LOG IN'}</Button>
      <Muted>Use the account provided by your faculty. On your first login, your section is your temporary password.</Muted>
    </Card>
    {help && <ModalFrame title="Account help" onClose={() => setHelp(false)}>
      <Muted>Contact your faculty or administrator about your account. Automated password recovery is not available in this prototype.</Muted>
      <Muted>If you have not signed in before, use the section exactly as it appears in the faculty roster.</Muted>
    </ModalFrame>}
  </>;
}

export function ChangePasswordScreen({ onComplete, onLogout }) {
  const { data, user, update } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return <Card>
    <Heading>Choose your password</Heading>
    <Muted>Your section password is temporary. Create one with at least 12 characters that is not your section.</Muted>
    {user.role === 'student' && process.env.EXPO_PUBLIC_API_URL && <Field label="Current password" password value={currentPassword} onChangeText={setCurrentPassword} />}
    <Field label="New password" password value={password} onChangeText={setPassword} />
    <Field label="Confirm new password" password value={confirm} onChangeText={setConfirm} />
    <ErrorText>{error}</ErrorText>
    <Button disabled={busy} onPress={async () => {
      if (lock.current) return;
      lock.current = true; setBusy(true); setError('');
      try {
        if (user.role === 'student' && process.env.EXPO_PUBLIC_API_URL) {
          const candidate = changePassword(data, user, password, confirm);
          await changeStudentPasswordRemotely(user, currentPassword, password, process.env.EXPO_PUBLIC_API_URL);
          const next = await update(() => candidate);
          const account = login(next, user.id, password);
          setCurrentPassword('');
          onComplete(account);
          return;
        }
        const next = await update(data => changePassword(data, user, password, confirm));
        onComplete(login(next, user.id, password));
      } catch (e) { setError(e.message || 'Could not save your password. Try again.'); }
      finally { lock.current = false; setBusy(false); }
    }}>{busy ? 'Saving...' : 'Save password and continue'}</Button>
    <LinkButton disabled={busy} onPress={onLogout}>Log out</LinkButton>
  </Card>;
}
