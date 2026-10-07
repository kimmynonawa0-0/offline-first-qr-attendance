import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { Button, Card, ErrorText, Field, Muted, ScanCorners, styles, Title } from './ui';

export default function Scanner({ data, onSave, busy }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const focused = useIsFocused();
  const [person, setPerson] = useState(null);
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
    const known = data.students.find(a => a.id === id);
    if (!known) {
      setError('This student ID is not in the imported roster. Ask the organizer to upload the latest roster.');
      scanLock.current = false;
      return;
    }
    setPerson({ id: known.id, name: known.name }); setError('');
  }
  return <Card admin>
    {!person && <>
      <Muted>Position the student QR inside the camera preview.</Muted>
      {permission?.granted && !error && active && focused ? <View style={styles.scanFrame}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned}
          onMountError={() => setError('Camera unavailable. Check camera permission and try again.')} />
        <ScanCorners />
      </View> : <>
        <Muted>Camera permission is needed for QR scanning.</Muted>
        <Button onPress={async () => {
          try {
            setError('');
            if (permission && !permission.canAskAgain) await Linking.openSettings();
            else await requestPermission();
          } catch { setError('Unable to open camera permissions. Check device settings and try again.'); }
        }}>{permission && !permission.canAskAgain ? 'Open device settings' : 'Allow camera'}</Button>
      </>}
      {!!error && <Button secondary onPress={() => { setError(''); scanLock.current = false; }}>Try scanning again</Button>}
    </>}
    {person && <>
      <Title>Confirm student</Title>
      <Muted>Confirm the student details before recording attendance.</Muted>
      <Field label="Student ID" editable={false} value={person.id} />
      <Field label="Full name" editable={false} value={person.name} />
      <Button disabled={busy} onPress={() => onSave(person, 'scan')}>{busy ? 'Saving...' : 'Mark present'}</Button>
      <Button secondary disabled={busy} onPress={() => { setPerson(null); scanLock.current = false; }}>Scan another QR</Button>
    </>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}
