import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { Button, Card, ErrorText, Field, Muted, Title } from './ui';

export default function Scanner({ data, onSave, onBack, busy }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const focused = useIsFocused();
  const [person, setPerson] = useState(null);
  const [method, setMethod] = useState('scan');
  const [error, setError] = useState('');
  const scanLock = useRef(false);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  function scanned({ data: raw }) {
    if (scanLock.current) return;
    scanLock.current = true;
    const id = raw.trim();
    if (!id || id.length > 100) { setError('This QR does not contain a valid student ID.'); scanLock.current = false; return; }
    const known = [...data.students, ...data.admins].find(a => a.id === id);
    setMethod('scan'); setPerson({ id, name: known?.name || '' }); setError('');
  }
  return <Card admin>
    <Title>Scan student QR</Title>
    {!person && <>
      <Muted>Position the student QR inside the camera preview.</Muted>
      {permission?.granted && !error && active && focused ? <View style={{ height: 280, borderRadius: 14, overflow: 'hidden' }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned}
          onMountError={() => setError('Camera unavailable. You can use a demo scan.')} />
      </View> : <>
        <Muted>Camera permission is needed for QR scanning.</Muted>
        <Button onPress={async () => {
          try {
            setError('');
            if (permission && !permission.canAskAgain) await Linking.openSettings();
            else await requestPermission();
          } catch { setError('Unable to open camera permissions. Use a demo scan.'); }
        }}>{permission && !permission.canAskAgain ? 'Open device settings' : 'Allow camera'}</Button>
      </>}
      <Button secondary onPress={() => { scanLock.current = true; setMethod('demo'); setPerson({ id: '', name: '' }); setError(''); }}>Simulate QR scan</Button>
    </>}
    {person && <>
      <Muted>{method === 'demo' ? 'Enter a student for this demo scan.' : 'Confirm the student details before recording attendance.'}</Muted>
      <Field label="Student ID" autoCapitalize="none" editable={method === 'demo'} value={person.id} onChangeText={id => setPerson({ ...person, id })} />
      <Field label="Full name" autoCapitalize="words" value={person.name} onChangeText={name => setPerson({ ...person, name })} />
      <Button disabled={busy} onPress={() => onSave(person, method)}>{busy ? 'Saving...' : 'Mark present'}</Button>
      <Button secondary disabled={busy} onPress={() => { setPerson(null); scanLock.current = false; }}>Scan another QR</Button>
    </>}
    <ErrorText>{error}</ErrorText>
    <Button secondary disabled={busy} onPress={onBack}>Back to event</Button>
  </Card>;
}
