import { useRef, useState } from 'react';
import { Button, Card, ErrorText, Field, Heading, LinkButton, ModalFrame, Muted, UniversityBanner } from './ui';
import { changePassword, login } from './model.mjs';
import { useApp } from './state';

export function LoginScreen({ onLogin }) {
  const { data } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  return <>
    <UniversityBanner />
    <Card>
      <Heading>Welcome back</Heading>
      <Muted>Sign in with your student ID. Your account opens the right workspace for you.</Muted>
      <Field label="Student ID" autoCapitalize="none" autoCorrect={false} value={identifier} onChangeText={setIdentifier} />
      <Field label="Password" value={password} onChangeText={setPassword} password />
      <LinkButton onPress={() => setHelp(true)}>Forgot password?</LinkButton>
      <ErrorText>{error}</ErrorText>
      <Button onPress={() => {
        try { const user = login(data, identifier, password); setPassword(''); onLogin(user); }
        catch (e) { setError(e.message); }
      }}>LOG IN</Button>
      <Muted>First time? Your faculty provides your account. Use your section as the temporary password, then choose your own.</Muted>
    </Card>
    {help && <ModalFrame title="Account help" onClose={() => setHelp(false)}>
      <Muted>Contact your faculty or administrator about your account. Automated password recovery is not available in this prototype.</Muted>
      <Muted>If you have not signed in before, use the section exactly as it appears in the faculty roster.</Muted>
    </ModalFrame>}
  </>;
}

export function ChangePasswordScreen({ onComplete, onLogout }) {
  const { user, update } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return <Card>
    <Heading>Choose your password</Heading>
    <Muted>{user.name}, replace your temporary password before using attendance features. Use at least 12 characters, not your section.</Muted>
    <Field label="New password" password value={password} onChangeText={setPassword} />
    <Field label="Confirm new password" password value={confirm} onChangeText={setConfirm} />
    <ErrorText>{error}</ErrorText>
    <Button disabled={busy} onPress={async () => {
      if (lock.current) return;
      lock.current = true; setBusy(true); setError('');
      try {
        const next = await update(data => changePassword(data, user, password, confirm));
        onComplete(login(next, user.id, password));
      } catch (e) { setError(e.message || 'Could not save your password. Try again.'); }
      finally { lock.current = false; setBusy(false); }
    }}>{busy ? 'Saving...' : 'Save password and continue'}</Button>
    <LinkButton disabled={busy} onPress={onLogout}>Log out</LinkButton>
  </Card>;
}
