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
import { BrandMark, Button, Card, colors, ErrorText, Eyebrow, Field, Heading, LinkButton, ModalFrame, Muted, Row, styles, Title } from './ui';

const adminScreens = ['admin-home', 'create-event', 'event', 'history', 'roster-import', 'scanner', 'receipt'];
const studentScreens = ['student-home', 'records'];
const go = (page, params = {}) => router.push({ pathname: '/[page]', params: { page, ...params } });
const replace = (page, params = {}) => router.replace({ pathname: '/[page]', params: { page, ...params } });

const pageTitles = {
  'change-password': 'Security',
  'student-home': 'Student home',
  records: 'Attendance records',
  'create-event': 'Create event',
  event: 'Event details',
  history: 'Events',
  'roster-import': 'Review roster',
  scanner: 'Scan Attendance',
  receipt: 'Attendance recorded',
};

function HeaderBar({ screen, user, online, eventId }) {
  const back = screen === 'records' ? ['student-home']
    : ['create-event', 'history', 'roster-import', 'event'].includes(screen) ? ['admin-home']
      : ['scanner', 'receipt'].includes(screen) ? ['event', { eventId }]
        : null;
  const localMode = user?.role === 'admin';
  return <View style={styles.header}>
    <View style={styles.headerLeading}>
      {back && <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => replace(back[0], back[1])} style={styles.headerBack}>
        <Ionicons name="arrow-back" size={24} color={colors.ink} />
      </Pressable>}
      {screen === 'admin-home' ? <BrandMark compact /> : <Text style={styles.pageTitle}>{pageTitles[screen] || 'NORWEScan'}</Text>}
    </View>
    <Text style={[styles.badge, !localMode && !online && { color: '#FF9B94', backgroundColor: '#281413', borderColor: '#74332F' }]}>
      {localMode ? 'LOCAL MODE' : online ? 'ONLINE' : 'OFFLINE'}
    </Text>
  </View>;
}

function NavItem({ active, icon, label, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.navItem}>
    <Ionicons name={icon} size={23} color={active ? colors.yellow : colors.muted} />
    <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
  </Pressable>;
}

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
    <Text style={{ color: colors.ink, fontWeight: '700' }}>{record.studentName} ({record.studentId})</Text>
    <Muted>{record.date} at {record.time}</Muted>
    <Muted>{methodLabel(record.method)}</Muted>
    <Text style={{ color: colors.yellow, fontWeight: '800' }}>PRESENT / {record.synced ? 'Demo synced' : 'Saved locally'}</Text>
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

function History({ events, onManage }) {
  const [expanded, setExpanded] = useState(null);
  return <>{events.length === 0 && <Muted>No events found.</Muted>}
    {[...events].reverse().map(event => <Card key={event.id}><EventSummary event={event} />
      <Muted>{event.attendees.length} students checked in</Muted>
      <Button secondary onPress={() => onManage(event.id)}>Manage event</Button>
      <LinkButton onPress={() => setExpanded(expanded === event.id ? null : event.id)}>{expanded === event.id ? 'Hide attendees' : 'Show attendees'}</LinkButton>
      {expanded === event.id && <Attendees event={event} />}
    </Card>)}
  </>;
}

function Attendees({ event }) {
  return event.attendees.length ? event.attendees.map(a => <View key={a.id} style={{ marginBottom: 10 }}>
    <Text style={{ color: colors.ink, fontWeight: '700' }}>{a.name} ({a.id})</Text>
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
    <BrandMark />{loading ? <ActivityIndicator color={colors.yellow} /> : <><ErrorText>{storageError}</ErrorText><Button onPress={load}>Retry loading</Button></>}
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
    <View style={styles.screenLead}><Text style={styles.greeting}>Good day,</Text><Text style={styles.greetingName}>{user.name}</Text></View>
    <Card><Eyebrow>My attendance QR</Eyebrow><View style={styles.qr}><QRCode value={user.id} size={176} /><Text style={styles.qrText}>Scan at the event</Text></View>
      <Button onPress={() => setQrOpen(true)}>Enlarge QR</Button></Card>
    <Card><Eyebrow>Current event</Eyebrow>{currentEvent ? <EventSummary event={currentEvent} /> : <Muted>No event is available on this device yet.</Muted>}</Card>
    <Card><Title>Attendance summary</Title><Metrics items={[
      ['Present', personalRecords.filter(r => r.status === 'PRESENT').length],
      ['Attendance rate', personalRecords.length ? `${Math.round(personalRecords.filter(r => r.status === 'PRESENT').length / personalRecords.length * 100)}%` : '0%'],
    ]} /></Card>
  </>;
  else if (screen === 'records') content = <><Field label="Search event" value={query} onChangeText={setQuery} />
    <RecordList records={personalRecords.filter(r => `${r.event} ${r.date}`.toLowerCase().includes(query.toLowerCase()))} /></>;
  else if (screen === 'admin-home') content = <>
    <View style={styles.screenLead}><Text style={styles.greeting}>Good day,</Text><Text style={styles.greetingName}>{user.name}</Text></View>
    <Metrics items={[["Present today", todayRecords.filter(r => r.status === 'PRESENT').length], ['Pending sync', pending]]} />
    <Button disabled={!currentEvent} onPress={() => currentEvent && go('scanner', { eventId: currentEvent.id })}>{currentEvent ? 'Start scanning' : 'Create an event to scan'}</Button>
    <Card admin><Eyebrow>Current event</Eyebrow>{currentEvent ? <><EventSummary event={currentEvent} /><Muted>{currentEvent.attendees.length} checked in</Muted><Button secondary onPress={() => go('event', { eventId: currentEvent.id })}>Manage event</Button></> : <Muted>No current event. Create one from Organizer tools.</Muted>}</Card>
    <Card><Title>Organizer tools</Title>
      <Button onPress={() => go('create-event')}>Create event</Button>
      <Button secondary onPress={() => go('roster-import')}>Import faculty roster</Button>
      <Button secondary onPress={() => go('history')}>View events</Button>
    </Card>
    {pending > 0 && <Card><Title>{pending} record{pending === 1 ? '' : 's'} waiting</Title><Muted>Attendance stays on this device until a connection is available.</Muted>
      <Button disabled={busy || !online} onPress={() => run(() => update(d => demoSync(d, user, online)), () => setNotice('Demo sync complete. No records were uploaded.'))}>Demo sync now</Button></Card>}
    <Title>Recent activity</Title><RecordList records={data.records.slice(0, 4)} />
  </>;
  else if (screen === 'roster-import') content = <RosterImport />;
  else if (screen === 'create-event') content = <EventForm busy={busy} onCancel={() => replace('admin-home')} onSave={fields => run(() => update(d => createEvent(d, user, fields, Crypto.randomUUID())), () => { replace('admin-home'); setNotice('Event created.'); })} />;
  else if (screen === 'history') content = <History events={data.events} onManage={id => go('event', { eventId: id })} />;
  else if (screen === 'event' && event) content = <>
    <Card admin><EventSummary event={event} /><Button purple onPress={() => go('scanner', { eventId })}>Scan for this event</Button></Card>
    <Card><Title>My attendance</Title><Muted>{user.name} ({user.id})</Muted>
      <Text style={{ color: colors.ink }}>{ownAttendance ? `Present: ${methodLabel(ownAttendance.method)} at ${ownAttendance.time}` : 'You have not checked in to this event yet.'}</Text>
      <Button disabled={busy || Boolean(ownAttendance)} onPress={() => run(() => update(d => checkIn(d, user, eventId, user, 'organizer', Crypto.randomUUID())), () => setNotice('You are present as an organizer.'))}>{ownAttendance ? 'Already present' : 'Check myself in'}</Button>
      <Button secondary onPress={() => setQrOpen(true)}>My QR</Button><Muted>Self check-in is recorded as organizer attendance.</Muted>
    </Card>
    <Card><Title>Attendees ({event.attendees.length})</Title><Attendees event={event} /></Card>
    <LinkButton onPress={() => setConfirm({ title: 'Delete event?', message: `Delete "${event.name}"? Attendance receipts will remain in local records.`, action: () => run(() => update(d => deleteEvent(d, user, event.id)), () => { setConfirm(null); setNotice('Event deleted.'); replace('admin-home'); }) })}>Delete event</LinkButton>
  </>;
  else if (screen === 'scanner' && event) content = <Scanner data={data} busy={busy} onSave={(person, method) => {
    const id = Crypto.randomUUID();
    run(() => update(d => checkIn(d, user, eventId, person, method, id)), () => replace('receipt', { eventId, recordId: id }));
  }} />;
  else if (screen === 'receipt' && receipt) content = <Card admin><Eyebrow>Saved locally</Eyebrow><Heading>ATTENDANCE RECORDED</Heading>
    <Title>{receipt.studentName}</Title><Muted>Student ID: {receipt.studentId}</Muted><EventSummary event={{ ...receipt, name: receipt.event }} />
    <Muted>{methodLabel(receipt.method)} / Saved locally</Muted><Button onPress={() => replace('event', { eventId: receipt.eventId })}>Done</Button>
  </Card>;
  else content = <Card><Title>Page or event not found</Title><Button onPress={() => replace(home)}>Back to dashboard</Button></Card>;

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <View style={styles.container}>
      {!authScreen && <HeaderBar screen={screen} user={user} online={online} eventId={eventId} />}
      {!!notice && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setNotice('')} style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></Pressable>}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <ErrorText>{error}</ErrorText>{content}
        </ScrollView>
      </KeyboardAvoidingView>
      {user && !mustChange && !['scanner', 'receipt'].includes(screen) && <View style={styles.nav}>
        <NavItem active={screen === home} icon={screen === home ? 'home' : 'home-outline'} label={user.role === 'admin' ? 'Dashboard' : 'Home'} onPress={() => replace(home)} />
        {user.role === 'student' && <NavItem active={screen === 'records'} icon={screen === 'records' ? 'list' : 'list-outline'} label="Records" onPress={() => replace('records')} />}
        {user.role === 'admin' && <NavItem active={screen === 'history'} icon={screen === 'history' ? 'calendar' : 'calendar-outline'} label="Events" onPress={() => replace('history')} />}
        <NavItem icon="log-out-outline" label="Logout" onPress={() => setConfirm({ title: 'Log out?', message: 'Your records will remain saved on this device.', action: () => { setUser(null); setConfirm(null); router.replace('/'); } })} />
      </View>}
    </View>
    {qrOpen && <ModalFrame title="My attendance QR" onClose={() => setQrOpen(false)}><View style={styles.qr}><QRCode value={user.id} size={Math.max(120, Math.min(width - 120, 260))} /><Text style={styles.qrText}>Student ID: {user.id}</Text><Text style={styles.qrText}>{user.name}</Text></View></ModalFrame>}
    {confirm && <ModalFrame title={confirm.title} onClose={() => setConfirm(null)} busy={busy}><Muted>{confirm.message}</Muted><ErrorText>{error}</ErrorText><Button disabled={busy} onPress={confirm.action}>{busy ? 'Saving...' : 'Confirm'}</Button><Button secondary disabled={busy} onPress={() => setConfirm(null)}>Cancel</Button></ModalFrame>}
  </SafeAreaView>;
}
