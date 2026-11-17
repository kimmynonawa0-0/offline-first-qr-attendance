import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { Button, Card, ErrorText, Field, Muted, ScanCorners, styles, Title } from './ui';
import { attendanceStatus } from './model.mjs';
import { eventEnd, eventSchedule, formatEventWindow } from './event-schedule.mjs';
import { formatTwelveHourTime } from './event-time.mjs';

const haptic = action => { action().catch(() => {}); };

export default function Scanner({ data, eventId, onSave, busy }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const focused = useIsFocused();
  const [person, setPerson] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const scanLock = useRef(false);
  const event = data.events.find(item => item.id === eventId);
  const schedule = event ? eventSchedule(event, now) : null;
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
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
    if (!schedule?.action) { reject(schedule?.message || 'This event cannot be scanned right now.'); return; }
    const known = data.students.find(a => a.id === id);
    if (!known) {
      reject('This student ID is not in the imported roster. Ask the organizer to upload the latest roster.');
      return;
    }
    const attendance = attendanceStatus(data, eventId, known.id);
    if (schedule.action === 'time-in' && attendance.status !== 'not-in') {
      reject(attendance.status === 'completed'
        ? 'This student has already completed Time In and Time Out for this event.'
        : `This student is already timed in. Time Out opens after ${formatTwelveHourTime(eventEnd(event))}.`);
      return;
    }
    if (schedule.action === 'time-out' && attendance.status === 'not-in') {
      reject('No Time In is recorded for this student. Time In must be scanned during the event window.');
      return;
    }
    if (schedule.action === 'time-out' && attendance.status === 'completed') {
      reject('This student is already timed out for this event.');
      return;
    }
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    setPerson({ id: known.id, name: known.name }); setError('');
  }
  const action = schedule?.action;
  const title = action === 'time-in' ? 'Time In scanning' : action === 'time-out' ? 'Time Out scanning' : 'Scanning unavailable';
  return <Card admin>
    <Title>{title}</Title>
    <Muted>{schedule?.message || 'This event was not found on this device.'}</Muted>
    {event && <Muted>{event.name} / {formatEventWindow(event)}</Muted>}
    {!person && <>
      {action ? <>
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
      </> : <Muted>Scanning opens automatically when the event window starts and switches to Time Out after it ends.</Muted>}
      {!!error && <Button secondary onPress={() => { setError(''); scanLock.current = false; }}>Try scanning again</Button>}
    </>}
    {person && <>
      <Title>Confirm student</Title>
      <Muted>Confirm the student details before recording {action === 'time-in' ? 'Time In' : 'Time Out'}.</Muted>
      <Field label="Student ID" editable={false} value={person.id} />
      <Field label="Full name" editable={false} value={person.name} />
      <Button disabled={busy || !action} onPress={() => onSave(person, 'scan', action)}>{busy ? 'Saving...' : action ? `Record ${action === 'time-in' ? 'Time In' : 'Time Out'}` : 'Scanning closed'}</Button>
      <Button secondary disabled={busy} onPress={() => { setPerson(null); scanLock.current = false; }}>Scan another QR</Button>
    </>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}
