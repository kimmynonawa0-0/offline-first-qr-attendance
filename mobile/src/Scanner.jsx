import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { Button, Card, ErrorText, Field, Muted, ScanCorners, SegmentedControl, styles, Title } from './ui';
import { attendanceStatus } from './model.mjs';

const haptic = action => { action().catch(() => {}); };

export default function Scanner({ data, eventId, initialMode = 'time-in', onSave, busy }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const focused = useIsFocused();
  const [person, setPerson] = useState(null);
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState('');
  const scanLock = useRef(false);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  function reject(message) {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    setError(message);
    scanLock.current = false;
  }
  function scanned({ data: raw }) {
    if (scanLock.current) return;
    scanLock.current = true;
    const id = raw.trim();
    if (!id || id.length > 100) { reject('This QR does not contain a valid student ID.'); return; }
    const known = data.students.find(a => a.id === id);
    if (!known) {
      reject('This student ID is not in the imported roster. Ask the organizer to upload the latest roster.');
      return;
    }
    const attendance = attendanceStatus(data, eventId, known.id);
    if (mode === 'time-in' && attendance.status !== 'not-in') {
      reject(attendance.status === 'completed'
        ? 'This student has already completed Time In and Time Out for this event.'
        : 'This student is already timed in. Switch to Time Out to record their exit.');
      return;
    }
    if (mode === 'time-out' && attendance.status === 'not-in') {
      reject('No Time In is recorded for this student. Switch to Time In first.');
      return;
    }
    if (mode === 'time-out' && attendance.status === 'completed') {
      reject('This student is already timed out for this event.');
      return;
    }
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    setPerson({ id: known.id, name: known.name }); setError('');
  }
  return <Card admin>
    <Title>{mode === 'time-in' ? 'Time In scanning' : 'Time Out scanning'}</Title>
    <Muted>Select a mode before scanning. A repeated scan will not change a completed action.</Muted>
    <SegmentedControl
      options={[{ value: 'time-in', label: 'Time In' }, { value: 'time-out', label: 'Time Out' }]}
      value={mode}
      disabled={busy || Boolean(person)}
      onChange={next => { haptic(() => Haptics.selectionAsync()); setMode(next); setError(''); }}
    />
    {!person && <>
      <Muted>Position the student QR inside the camera preview.</Muted>
      {permission?.granted && !error && active && focused ? <View style={styles.scanFrame}>
        <CameraView style={styles.fill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned}
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
      <Muted>Confirm the student details before recording {mode === 'time-in' ? 'Time In' : 'Time Out'}.</Muted>
      <Field label="Student ID" editable={false} value={person.id} />
      <Field label="Full name" editable={false} value={person.name} />
      <Button disabled={busy} onPress={() => onSave(person, 'scan', mode)}>{busy ? 'Saving...' : `Record ${mode === 'time-in' ? 'Time In' : 'Time Out'}`}</Button>
      <Button secondary disabled={busy} onPress={() => { setPerson(null); scanLock.current = false; }}>Scan another QR</Button>
    </>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}
