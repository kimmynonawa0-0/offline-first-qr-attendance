import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import QRCode from 'react-native-qrcode-svg';
import { useApp } from './state';
import { ChangePasswordScreen, LoginScreen } from './Auth';
import RosterImport from './RosterImport';
import Scanner from './Scanner';
import { checkIn, createEvent, deleteEvent, demoSync, localDate, methodLabel } from './model.mjs';
import { Button, Card, colors, ErrorText, Field, Heading, LinkButton, ModalFrame, Muted, Row, styles, Title, UniversityBanner } from './ui';

const adminScreens = ['admin-home', 'create-event', 'event', 'history', 'scanner', 'receipt'];
const studentScreens = ['student-home', 'records'];
const go = (page, params = {}) => router.push({ pathname: '/[page]', params: { page, ...params } });
const replace = (page, params = {}) => router.replace({ pathname: '/[page]', params: { page, ...params } });

function Metrics({ items }) {
  return <Row>{items.map(([label, value]) => <View key={label} style={styles.metric}>
    <Text style={styles.metricValue}>{value}</Text><Muted>{label}</Muted>
  </View>)}</Row>;
}

function EventSummary({ event }) {
  return <><Title>{event.name}</Title><Muted>{event.location}</Muted><Muted>{event.date} at {event.time}</Muted></>;
}

function RecordList({ records }) {
  return records.length ? records.map(record => <Card key={record.id}>
    <Title>{record.event}</Title>
    <Text>{record.studentName} ({record.studentId})</Text>
    <Muted>{record.date} at {record.time}</Muted>
    <Muted>{methodLabel(record.method)}</Muted>
    <Text style={{ color: colors.green, fontWeight: '700' }}>PRESENT / {record.synced ? 'Demo synced' : 'Saved locally'}</Text>
  </Card>) : <Muted>No attendance records yet.</Muted>;
}

function EventForm({ onSave, busy, onCancel }) {
  const [fields, setFields] = useState({ name: '', location: '', date: localDate(), time: '10:00' });
  return <Card admin><Title>Add event</Title>
    {[['name', 'Event name'], ['location', 'Location'], ['date', 'Date (YYYY-MM-DD)'], ['time', 'Time (HH:MM, 24-hour)']].map(([key, label]) =>
      <Field key={key} label={label} value={fields[key]} onChangeText={value => setFields({ ...fields, [key]: value })} placeholder={key === 'date' ? '2026-09-23' : key === 'time' ? '10:00' : ''} />)}
    <Button disabled={busy} onPress={() => onSave(fields)}>{busy ? 'Saving...' : 'Create event'}</Button>
    <Button secondary disabled={busy} onPress={onCancel}>Cancel</Button>
  </Card>;
}

function History({ events }) {
  const [expanded, setExpanded] = useState(null);
  return <><Title>Event history</Title>{events.length === 0 && <Muted>No events found.</Muted>}
    {[...events].reverse().map(event => <Card key={event.id}><EventSummary event={event} />
      <Muted>{event.attendees.length} students checked in</Muted>
      <LinkButton onPress={() => setExpanded(expanded === event.id ? null : event.id)}>{expanded === event.id ? 'Hide attendees' : 'Show attendees'}</LinkButton>
      {expanded === event.id && <Attendees event={event} />}
    </Card>)}
  </>;
}

function Attendees({ event }) {
  return event.attendees.length ? event.attendees.map(a => <View key={a.id} style={{ marginBottom: 10 }}>
    <Text style={{ fontWeight: '600' }}>{a.name} ({a.id})</Text>
    <Muted>{a.time} / {methodLabel(a.method)}</Muted>
  </View>) : <Muted>No students checked in yet.</Muted>;
}

export default function AppScreen() {
  const { page: screen = 'login', eventId, recordId } = useLocalSearchParams();
  const focused = useIsFocused();
  const { data, user, setUser, loading, error: storageError, load, update, online, notice, setNotice } = useApp();
  const [qrOpen, setQrOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const lock = useRef(false);
  const { width } = useWindowDimensions();
  const home = user?.role === 'admin' ? 'admin-home' : 'student-home';
  async function run(action, after) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { const result = await action(); after?.(result); }
    catch (e) { setError(e.message || 'Could not save. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (loading || !data) return <SafeAreaView style={styles.safe}><View style={{ padding: 24 }}>
    <Heading>NORWE-SCAN</Heading>{loading ? <ActivityIndicator color={colors.green} /> : <><ErrorText>{storageError}</ErrorText><Button onPress={load}>Retry loading</Button></>}
  </View></SafeAreaView>;
  const authScreen = ['login', 'student-login', 'admin-login'].includes(screen);
  const account = user && data[user.role === 'admin' ? 'admins' : 'students'].find(a => a.id === user.id);
  const mustChange = Boolean(account?.mustChangePassword);
  if (!authScreen && !user) return focused ? <Redirect href="/" /> : null;
  if (user && mustChange && screen !== 'change-password') return focused ? <Redirect href="/change-password" /> : null;
  if (user && !mustChange && screen === 'change-password') return focused ? <Redirect href={`/${home}`} /> : null;
  if (user && (authScreen || (adminScreens.includes(screen) && user.role !== 'admin') || (studentScreens.includes(screen) && user.role !== 'student'))) {
    return focused ? <Redirect href={`/${home}`} /> : null;
  }
  const event = data.events.find(e => e.id === eventId);
  const personalRecords = user ? data.records.filter(r => r.studentId === user.id) : [];
  const todayEvents = data.events.filter(e => e.date === localDate());
  const currentEvent = todayEvents[0] || data.events.at(-1);
  const todayRecords = data.records.filter(r => r.date === localDate());
  const pending = data.records.filter(r => !r.synced).length;
  const ownAttendance = event?.attendees.find(a => a.id === user?.id);
  const receipt = data.records.find(r => r.id === recordId);

  let content;
  if (authScreen) content = <LoginScreen
    onLogin={account => { setUser(account); replace(account.mustChangePassword ? 'change-password' : account.role === 'admin' ? 'admin-home' : 'student-home'); }} />;
  else if (screen === 'change-password') content = <ChangePasswordScreen
    onComplete={account => { setUser(account); replace(account.role === 'admin' ? 'admin-home' : 'student-home'); }}
    onLogout={() => { setUser(null); router.replace('/'); }} />;
  else if (screen === 'student-home') content = <>
    <UniversityBanner />
    <Card><Muted>Welcome, Student</Muted><Title>{user.name}</Title><Muted>ID: {user.id}</Muted></Card>
    <Card><Title>Attendance summary</Title><Metrics items={[
      ['Total records', personalRecords.length], ['Present', personalRecords.filter(r => r.status === 'PRESENT').length],
      ['Absent', personalRecords.filter(r => r.status === 'ABSENT').length],
      ['Attendance rate', personalRecords.length ? `${Math.round(personalRecords.filter(r => r.status === 'PRESENT').length / personalRecords.length * 100)}%` : '0%'],
    ]} /></Card>
    <Card><Title>Your attendance QR</Title><View style={styles.qr}><QRCode value={user.id} size={160} /></View>
      <Muted>Show this to the admin to mark your attendance.</Muted><Button onPress={() => setQrOpen(true)}>Enlarge QR</Button></Card>
    <Card><Title>Current event</Title>{currentEvent ? <EventSummary event={currentEvent} /> : <><Muted>No current event to show.</Muted><Button secondary onPress={() => setNotice('No events available on this device yet.')}>Reload events</Button></>}</Card>
  </>;
  else if (screen === 'records') content = <><Title>Attendance records</Title><Field label="Search event" value={query} onChangeText={setQuery} />
    <RecordList records={personalRecords.filter(r => `${r.event} ${r.date}`.toLowerCase().includes(query.toLowerCase()))} /></>;
  else if (screen === 'admin-home') content = <>
    <UniversityBanner />
    <Card admin><Muted>Admin control</Muted><Title>{user.name}</Title><Button purple onPress={() => go('create-event')}>+ Create event</Button><Button secondary onPress={() => go('history')}>History</Button></Card>
    <RosterImport />
    <Card><Title>Today&apos;s events</Title>{todayEvents.length ? todayEvents.map(e => <View key={e.id}><Text style={{ fontWeight: '600' }}>{e.name}</Text><Muted>{e.attendees.length} checked in</Muted></View>) : <Muted>No events for today.</Muted>}</Card>
    <Card><Title>Today&apos;s attendance</Title><Metrics items={[["Total", todayRecords.length], ['Present', todayRecords.filter(r => r.status === 'PRESENT').length]]} /></Card>
    <Card><Title>Manage events</Title>{data.events.length ? data.events.map(e => <View key={e.id}>
      <EventSummary event={e} /><Muted>{e.attendees.length} students checked in</Muted>
      <Button purple onPress={() => go('event', { eventId: e.id })}>Manage</Button>
      <LinkButton onPress={() => setConfirm({ title: 'Delete event?', message: `Delete "${e.name}"? Attendance receipts will remain in local records.`, action: () => run(() => update(d => deleteEvent(d, user, e.id)), () => { setConfirm(null); setNotice('Event deleted.'); }) })}>Delete event</LinkButton>
      <View style={styles.separator} />
    </View>) : <Muted>No events created yet.</Muted>}</Card>
    <Card><Title>Pending local records: {pending}</Title><Muted>Demo sync updates local status only. No server is connected.</Muted>
      <Button disabled={busy || !pending || !online} onPress={() => run(() => update(d => demoSync(d, user, online)), () => setNotice('Demo sync complete. No records were uploaded.'))}>Demo sync now</Button>
      {!online && <Muted>Offline: records remain on this device.</Muted>}</Card>
    <Title>Recent attendance</Title><RecordList records={data.records.slice(0, 5)} />
  </>;
  else if (screen === 'create-event') content = <EventForm busy={busy} onCancel={() => replace('admin-home')} onSave={fields => run(() => update(d => createEvent(d, user, fields, Crypto.randomUUID())), () => { replace('admin-home'); setNotice('Event created.'); })} />;
  else if (screen === 'history') content = <><LinkButton onPress={() => replace('admin-home')}>Back to dashboard</LinkButton><History events={data.events} /></>;
  else if (screen === 'event' && event) content = <>
    <LinkButton onPress={() => replace('admin-home')}>Back to dashboard</LinkButton>
    <Card admin><EventSummary event={event} /><Button purple onPress={() => go('scanner', { eventId })}>Scan for this event</Button></Card>
    <Card><Title>My attendance</Title><Muted>{user.name} ({user.id})</Muted>
      <Text>{ownAttendance ? `Present: ${methodLabel(ownAttendance.method)} at ${ownAttendance.time}` : 'You have not checked in to this event yet.'}</Text>
      <Button disabled={busy || Boolean(ownAttendance)} onPress={() => run(() => update(d => checkIn(d, user, eventId, user, 'organizer', Crypto.randomUUID())), () => setNotice('You are present as an organizer.'))}>{ownAttendance ? 'Already present' : 'Check myself in'}</Button>
      <Button secondary onPress={() => setQrOpen(true)}>My QR</Button><Muted>Self check-in is recorded as organizer attendance.</Muted>
    </Card>
    <Card><Title>Attendees ({event.attendees.length})</Title><Attendees event={event} /></Card>
  </>;
  else if (screen === 'scanner' && event) content = <Scanner data={data} busy={busy} onBack={() => replace('event', { eventId })} onSave={(person, method) => {
    const id = Crypto.randomUUID();
    run(() => update(d => checkIn(d, user, eventId, person, method, id)), () => replace('receipt', { eventId, recordId: id }));
  }} />;
  else if (screen === 'receipt' && receipt) content = <Card><Heading>ATTENDANCE RECORDED</Heading>
    <Title>{receipt.studentName}</Title><Muted>Student ID: {receipt.studentId}</Muted><EventSummary event={{ ...receipt, name: receipt.event }} />
    <Muted>{methodLabel(receipt.method)} / Saved locally</Muted><Button onPress={() => replace('event', { eventId: receipt.eventId })}>Done</Button>
  </Card>;
  else content = <Card><Title>Page or event not found</Title><Button onPress={() => replace(home)}>Back to dashboard</Button></Card>;

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark" />
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.brand}>NORWE-SCAN</Text><Text style={[styles.badge, !online && { color: colors.red, backgroundColor: '#fef2f2' }]}>{online ? 'Online' : 'Offline'}</Text></View>
      {!!notice && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setNotice('')} style={styles.notice}><Text>{notice}</Text></Pressable>}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <ErrorText>{error}</ErrorText>{content}
        </ScrollView>
      </KeyboardAvoidingView>
      {user && !mustChange && screen !== 'scanner' && <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel={user.role === 'admin' ? 'Dashboard' : 'Home'} onPress={() => replace(home)} style={styles.navItem}><Ionicons name="home-outline" size={23} color={colors.green} /><Text style={styles.navText}>{user.role === 'admin' ? 'Dashboard' : 'Home'}</Text></Pressable>
        {user.role === 'student' && <Pressable accessibilityRole="button" accessibilityLabel="Records" onPress={() => replace('records')} style={styles.navItem}><Ionicons name="list-outline" size={23} color={colors.green} /><Text style={styles.navText}>Records</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Logout" onPress={() => setConfirm({ title: 'Log out?', message: 'Your records will remain saved on this device.', action: () => { setUser(null); setConfirm(null); router.replace('/'); } })} style={styles.navItem}><Ionicons name="log-out-outline" size={23} color={colors.green} /><Text style={styles.navText}>Logout</Text></Pressable>
      </View>}
    </View>
    {qrOpen && <ModalFrame title="My attendance QR" onClose={() => setQrOpen(false)}><View style={styles.qr}><QRCode value={user.id} size={Math.max(120, Math.min(width - 120, 260))} /><Text>Student ID: {user.id}</Text><Muted>{user.name}</Muted></View></ModalFrame>}
    {confirm && <ModalFrame title={confirm.title} onClose={() => setConfirm(null)} busy={busy}><Muted>{confirm.message}</Muted><ErrorText>{error}</ErrorText><Button disabled={busy} onPress={confirm.action}>{busy ? 'Saving...' : 'Confirm'}</Button><Button secondary disabled={busy} onPress={() => setConfirm(null)}>Cancel</Button></ModalFrame>}
  </SafeAreaView>;
}
