import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Button, Card, ErrorText, Field, Heading, LinkButton, ModalFrame, Muted, UniversityBanner } from './ui';
import { cacheRemoteAdminPassword, cacheRemoteStudent, changePassword, mergeOrganizerBootstrap, sessionFor } from './model.mjs';
import { authenticateOffline, getOfflineCredential, saveOfflineCredential } from './offline-auth.mjs';
import { changeAdminPasswordRemotely, changeStudentPasswordRemotely, downloadOrganizerBootstrap, isRetryableAuthFailure, loginStudentRemotely } from './remote-sync.mjs';
import { reauthenticateOrganizer } from './web-auth.mjs';
import { useApp } from './state';

export function LoginScreen({ onLogin }) {
  const { data, update, adminSession, setAdminSession, setWebCredential, setAdminAuthIssue, setNotice, online } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const native = Platform.OS !== 'web';
  async function finishLogin(account) {
    setPassword('');
    if (!native) setWebCredential(account, password);
    await onLogin(account);
  }
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
          const apiUrl = process.env.EXPO_PUBLIC_API_URL;
          if (!native && !apiUrl) {
            throw new Error('The PWA is not connected to the attendance server. Configure its API URL and try again.');
          }
          if (native && online === false) {
            const account = await authenticateOffline(data, identifier, password, SecureStore);
            if (account.role === 'admin') {
              setAdminAuthIssue('Offline sign-in. Organizer uploads will reauthenticate when the server is reachable.');
            }
            setNotice('Signed in offline. Your saved records remain on this device until you sync.');
            await finishLogin(account); return;
          }
          if (apiUrl) {
            try {
              const remote = await loginStudentRemotely(identifier, password, apiUrl, fetch,
                adminSession?.id === identifier.trim() ? adminSession.token : undefined);
              if (remote.role === 'admin') {
                if (remote.accessLevel === 'manager') {
                  throw new Error('System manager accounts use the management website, not the scanning app.');
                }
                if (native) {
                  try { await saveOfflineCredential(SecureStore, 'admin', remote.id, password); }
                  catch { setNotice('Signed in, but this device could not protect an offline password. Offline sign-in is not enabled.'); }
                }
                let bootstrap = null;
                let bootstrapError = null;
                if (!remote.mustChangePassword) {
                  try { bootstrap = await downloadOrganizerBootstrap(remote.sessionToken, apiUrl); }
                  catch (error) { bootstrapError = error; }
                }
                const next = await update(current => cacheRemoteAdminPassword(
                  bootstrap ? mergeOrganizerBootstrap(current, bootstrap) : current,
                  remote.id, undefined, { name: remote.name, section: remote.section, mustChangePassword: remote.mustChangePassword },
                ));
                await setAdminSession({ id: remote.id, token: remote.sessionToken });
                setAdminAuthIssue('');
                if (bootstrapError) setNotice(`Signed in. Assigned events could not be downloaded: ${bootstrapError.message}`);
                await finishLogin(sessionFor(next.admins.find(account => account.id === remote.id), 'admin')); return;
              }
              if (localAdmin) throw new Error('This ID is not registered as an organizer on the server.');
              if (native) {
                try { await saveOfflineCredential(SecureStore, 'student', remote.id, password); }
                catch { setNotice('Signed in, but this device could not protect an offline password. Offline sign-in is not enabled.'); }
              }
              const next = await update(current => cacheRemoteStudent(current, remote));
              await finishLogin(sessionFor(next.students.find(account => account.id === remote.id), 'student')); return;
            } catch (remoteError) {
              if (native && isRetryableAuthFailure(remoteError)) {
                const account = await authenticateOffline(data, identifier, password, SecureStore);
                if (account.role === 'admin') setAdminAuthIssue(remoteError.message);
                setNotice("Server unavailable. Signed in with this device's protected offline credential.");
                await finishLogin(account); return;
              }
              throw remoteError;
            }
          }
          if (native) {
            const account = await authenticateOffline(data, identifier, password, SecureStore);
            await finishLogin(account); return;
          }
          throw new Error('Connect to the attendance server before signing in to the PWA.');
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
  const { data, user, update, webCredential, setWebCredential, adminSession, setAdminSession, setNotice } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const native = Platform.OS !== 'web';
  const hasWebCredential = webCredential?.id === user.id && webCredential?.role === user.role;
  return <Card>
    <Heading>Choose your password</Heading>
    <Muted>Your section password is temporary. Create one with at least 12 characters that is not your section.</Muted>
    {!native && !hasWebCredential && <Field label="Current password" password value={currentPassword} onChangeText={setCurrentPassword} />}
    <Field label="New password" password value={password} onChangeText={setPassword} />
    <Field label="Confirm new password" password value={confirm} onChangeText={setConfirm} />
    <ErrorText>{error}</ErrorText>
    <Button disabled={busy} onPress={async () => {
      if (lock.current) return;
      lock.current = true; setBusy(true); setError('');
      try {
        const savedPassword = native
          ? await getOfflineCredential(SecureStore, user.role, user.id)
          : webCredential?.id === user.id && webCredential?.role === user.role
            ? webCredential.password
            : currentPassword;
        if (savedPassword && password === savedPassword) {
          throw new Error('Choose a new password, not your current password.');
        }
        if (user.role === 'student' && process.env.EXPO_PUBLIC_API_URL) {
          if (!savedPassword) throw new Error('Please sign in again to update your temporary password.');
          const candidate = changePassword(data, user, password, confirm);
          await changeStudentPasswordRemotely(user, savedPassword, password, process.env.EXPO_PUBLIC_API_URL);
          if (native) {
            try { await saveOfflineCredential(SecureStore, 'student', user.id, password); }
            catch { setNotice('Password changed on the server, but this device could not update its protected offline credential. Sign in online with the new password before using offline access.'); }
          }
          const next = await update(() => candidate);
          if (!native) setWebCredential(user, password);
          const account = native ? { ...user, mustChangePassword: false } : sessionFor(next.students.find(item => item.id === user.id), 'student');
          await onComplete(account);
          return;
        }
        if (user.role === 'admin' && process.env.EXPO_PUBLIC_API_URL && (native ? adminSession?.id === user.id : true)) {
          if (!savedPassword) throw new Error('Please sign in again to update your temporary password.');
          const candidate = changePassword(data, user, password, confirm);
          const currentSession = native
            ? adminSession
            : await reauthenticateOrganizer(user, savedPassword, process.env.EXPO_PUBLIC_API_URL);
          const currentToken = native ? currentSession.token : currentSession.sessionToken;
          const updatedSession = await changeAdminPasswordRemotely(user, currentToken,
            savedPassword, password, process.env.EXPO_PUBLIC_API_URL);
          if (native) {
            try { await saveOfflineCredential(SecureStore, 'admin', user.id, password); }
            catch { setNotice('Password changed on the server, but this device could not update its protected offline credential. Sign in online with the new password before using offline access.'); }
          }
          await setAdminSession({ id: user.id, token: updatedSession.sessionToken });
          let bootstrap = null;
          try { bootstrap = await downloadOrganizerBootstrap(updatedSession.sessionToken, process.env.EXPO_PUBLIC_API_URL); }
          catch (bootstrapError) { setNotice(`Password updated. Assigned events could not be downloaded: ${bootstrapError.message}`); }
          const next = await update(() => bootstrap ? mergeOrganizerBootstrap(candidate, bootstrap) : candidate);
          if (!native) setWebCredential(user, password);
          await onComplete(native ? { ...user, mustChangePassword: false } : sessionFor(next.admins.find(item => item.id === user.id), 'admin'));
          return;
        }
        if (native) throw new Error('Connect to the internet to finish changing your password. Your temporary password has not been changed.');
        const next = await update(data => changePassword(data, user, password, confirm));
        if (!native) setWebCredential(user, password);
        const savedAccount = next[user.role === 'admin' ? 'admins' : 'students'].find(account => account.id === user.id);
        await onComplete(sessionFor(savedAccount, user.role));
      } catch (e) { setError(e.message || 'Could not save your password. Try again.'); }
      finally { lock.current = false; setBusy(false); }
    }}>{busy ? 'Saving...' : 'Save password and continue'}</Button>
    <LinkButton disabled={busy} onPress={onLogout}>Log out</LinkButton>
  </Card>;
}
