import { useRef, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, colors, ErrorText, Field, Heading, LinkButton, ModalFrame, Muted, UniversityBanner } from './ui';
import { issueChallenge, login, register, resetPassword, verifyChallenge } from './model.mjs';
import { useApp } from './state';

function AccountFields({ fields, setFields, emailLocked = false }) {
  const field = (key, label, props = {}) => <Field key={key} label={label} value={fields[key] || ''} onChangeText={value => setFields({ ...fields, [key]: value })} {...props} />;
  return <View>
    {field('id', 'Student ID', { autoCapitalize: 'none' })}
    {field('name', 'Full name', { autoCapitalize: 'words' })}
    {field('email', 'Email', { email: true, editable: !emailLocked })}
    {field('password', 'Password', { password: true })}
    {field('confirm', 'Confirm password', { password: true })}
  </View>;
}

export function LoginScreen({ role, onLogin, onSwitch }) {
  const { data } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const admin = role === 'admin';
  return <>
    <UniversityBanner />
    <Card admin={admin}>
      <View style={{ alignSelf: 'center', padding: 18, borderRadius: 50, backgroundColor: colors.light }}>
        <Ionicons name={admin ? 'shield-checkmark-outline' : 'school-outline'} size={36} color={colors.green} />
      </View>
      <Heading>{admin ? 'ADMIN LOG IN' : 'STUDENT LOG IN'}</Heading>
      <View>
        <Field label={admin ? 'Email' : 'Student ID'} email={admin} autoCapitalize="none" value={identifier} onChangeText={setIdentifier} />
        <Field label="Password" value={password} onChangeText={setPassword} password />
        <LinkButton onPress={() => setModal('reset')}>Forgot password?</LinkButton>
        <ErrorText>{error}</ErrorText>
        <Button purple={admin} onPress={() => {
          try { const user = login(data, role, identifier, password); setPassword(''); onLogin(user); }
          catch (e) { setError(e.message); }
        }}>LOG IN</Button>
      </View>
      <LinkButton onPress={() => setModal('signup')}>Don&apos;t have an account? SIGN UP</LinkButton>
      <LinkButton onPress={onSwitch}>{admin ? 'Back to Student Login' : 'Are you admin? ADMIN LOGIN'}</LinkButton>
    </Card>
    {modal && <AuthModal role={role} purpose={modal} onClose={() => setModal(null)} onComplete={account => {
      setIdentifier(admin ? account.email : account.id); setPassword(''); setError(''); setModal(null);
    }} />}
  </>;
}

function AuthModal({ role, purpose, onClose, onComplete }) {
  const { data, update, setNotice } = useApp();
  const directSignup = purpose === 'signup' && role === 'student';
  const [step, setStep] = useState(directSignup ? 3 : 1);
  const [fields, setFields] = useState({ id: '', name: '', email: '', password: '', confirm: '' });
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  function restart() {
    setChallenge(null); setCode(''); setStep(1); setError('');
    setFields({ ...fields, password: '', confirm: '' });
  }
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await update(current => purpose === 'reset'
        ? resetPassword(current, challenge, fields.password, fields.confirm)
        : register(current, role, fields, challenge));
      setChallenge(null);
      setNotice(purpose === 'reset' ? 'Password updated. Log in with your new password.' : 'Account created. Please log in.');
      onComplete({ id: purpose === 'reset' ? challenge.id : fields.id.trim(), email: challenge?.email || fields.email.trim().toLowerCase() });
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <ModalFrame title={`${role === 'admin' ? 'Admin' : 'Student'} ${purpose === 'reset' ? 'password reset' : 'sign up'}`} onClose={onClose} busy={busy}>
    {!directSignup && <Muted>Step {step} of 3</Muted>}
    {step === 1 && <>
      <Muted>{purpose === 'reset' ? 'Enter your registered email.' : 'Enter an approved admin email.'}</Muted>
      <Field label="Email" email value={fields.email} onChangeText={email => setFields({ ...fields, email })} />
      {error.includes('shared') && <Field label="Student ID" value={fields.id} onChangeText={id => setFields({ ...fields, id })} autoCapitalize="none" />}
      <Button onPress={() => {
        try {
          const token = Crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
          const next = issueChallenge(data, { purpose, role, email: fields.email, studentId: fields.id, code: token });
          setChallenge(next); setCode(token); setFields({ ...fields, email: next.email }); setStep(2); setError('');
        } catch (e) { setError(e.message); }
      }}>Get verification code</Button>
    </>}
    {step === 2 && <>
      <Muted>Demo: the code is filled in automatically. No email is sent. Complete this process within 15 minutes.</Muted>
      <Muted>{challenge.email}</Muted>
      <Field label="Verification code" value={code} onChangeText={setCode} autoCapitalize="characters" />
      <Button onPress={() => {
        try { setChallenge(verifyChallenge(challenge, code)); setCode(''); setStep(3); setError(''); }
        catch (e) { setError(e.message); }
      }}>Verify code</Button>
    </>}
    {step === 3 && <>
      {purpose === 'signup' ? <AccountFields fields={fields} setFields={setFields} emailLocked={role === 'admin'} /> : <>
        <Muted>Your other account details will stay the same.</Muted>
        <Field label="New password" value={fields.password} password onChangeText={password => setFields({ ...fields, password })} />
        <Field label="Confirm new password" value={fields.confirm} password onChangeText={confirm => setFields({ ...fields, confirm })} />
      </>}
      <Button purple={role === 'admin'} disabled={busy} onPress={save}>{busy ? 'Saving...' : purpose === 'reset' ? 'Update password' : 'Create account'}</Button>
    </>}
    <ErrorText>{error}</ErrorText>
    {!directSignup && step > 1 && <LinkButton disabled={busy} onPress={restart}>Change email / request a new code</LinkButton>}
  </ModalFrame>;
}
