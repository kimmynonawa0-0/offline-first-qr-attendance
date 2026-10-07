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
import { checkIn, createEvent, deleteEvent, localDate, mergeStudentAttendance, methodLabel } from './model.mjs';
import { downloadStudentAttendance, markSynced, syncToServer } from './remote-sync.mjs';
import { BrandMark, Button, Card, colors, ErrorText, Field, LinkButton, ModalFrame, Muted, Row, ScanCorners, styles, Title } from './ui';

const adminScreens = ['admin-home', 'admin-records', 'create-event', 'event', 'history', 'roster-import', 'scanner', 'receipt'];
const studentScreens = ['student-home', 'records', 'profile'];
const go = (page, params = {}) => router.push({ pathname: '/[page]', params: { page, ...params } });
const replace = (page, params = {}) => router.replace({ pathname: '/[page]', params: { page, ...params } });

const pageTitles = {
  'change-password': 'Security',
  'student-home': 'Student home',
  records: 'Attendance records',
  profile: 'Profile',
  'create-event': 'Create event',
  event: 'Event details',
  history: 'Events',
  'admin-records': 'Attendance records',
  'roster-import': 'Review roster',
  scanner: 'Scan Attendance',
  receipt: 'Attendance recorded',
};

function HeaderBar({ screen, user, online, eventId }) {
  const back = ['records', 'profile'].includes(screen) ? ['student-home']
    : ['admin-records', 'create-event', 'history', 'roster-import', 'event'].includes(screen) ? ['admin-home']
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

function EventRow({ event, onPress }) {
  const when = event.date === localDate() ? 'Today' : event.date;
  const label = event.date === localDate() ? 'Current event' : 'Latest event';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${event.name}`} onPress={onPress} style={({ pressed }) => [styles.eventRow, pressed && styles.buttonMuted]}>
    <View style={styles.eventIcon}><Ionicons name="calendar-outline" size={23} color={colors.yellow} /></View>
    <View style={styles.eventText}>
      <Text style={styles.eventLabel}>{label} / {when}</Text>
      <Text numberOfLines={2} style={styles.eventName}>{event.name}</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={colors.ink} />
  </Pressable>;
}

function RecentActivity({ records, onSeeAll }) {
  return <Card>
    <View style={styles.activityHeader}><Title>Recent activity</Title><LinkButton onPress={onSeeAll}>See all</LinkButton></View>
    {records.length ? records.map(record => <View key={record.id} style={styles.activityRow}>
      <Ionicons name="document-text-outline" size={22} color={colors.paper} />
      <View style={styles.activityText}>
        <Text numberOfLines={1} style={styles.activityName}>{record.studentName} / {record.studentId}</Text>
        <Text style={styles.activityTime}>{record.time}</Text>
      </View>
      <Text style={styles.activityStatus}>Checked in</Text>
    </View>) : <Muted>No attendance records yet.</Muted>}
  </Card>;
}

function RecordList({ records }) {
  return records.length ? records.map(record => <Card key={record.id}>
    <Title>{record.event}</Title>
    <Text style={{ color: colors.ink, fontWeight: '700' }}>{record.studentName} ({record.studentId})</Text>
    <Muted>{record.date} at {record.time}</Muted>
    <Muted>{methodLabel(record.method)}</Muted>
    <Text style={{ color: colors.yellow, fontWeight: '800' }}>PRESENT / {record.synced ? 'Synced' : 'Saved locally'}</Text>
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
  const [eventInfoOpen, setEventInfoOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncPassword, setSyncPassword] = useState('');
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
  async function refreshStudentAttendance() {
    const student = data.students.find(account => account.id === user?.id);
    if (!student?.password) throw new Error('Sign in online on this device before refreshing attendance.');
    const records = await downloadStudentAttendance(user, student.password, process.env.EXPO_PUBLIC_API_URL);
    await update(current => mergeStudentAttendance(current, user.id, records));
    return records.length;
  }
  function requestLogout() {
    setConfirm({ title: 'Log out?', message: 'Your records will remain saved on this device.', action: () => { setUser(null); setConfirm(null); router.replace('/'); } });
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
  const latestPersonalRecord = personalRecords[0];

  let content;
  if (authScreen) content = <LoginScreen
    onLogin={account => { setUser(account); replace(account.mustChangePassword ? 'change-password' : account.role === 'admin' ? 'admin-home' : 'student-home'); }} />;
  else if (screen === 'change-password') content = <ChangePasswordScreen
    onComplete={account => { setUser(account); replace(account.role === 'admin' ? 'admin-home' : 'student-home'); }}
    onLogout={() => { setUser(null); router.replace('/'); }} />;
  else if (screen === 'student-home') content = <>
    <View style={styles.screenLead}><Text style={styles.greeting}>Good day,</Text><Text style={styles.greetingName}>{user.name}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Enlarge QR" onPress={() => setQrOpen(true)} style={({ pressed }) => [styles.attendanceQrCard, pressed && styles.buttonMuted]}>
      <Text style={styles.attendanceQrTitle}>MY ATTENDANCE QR</Text>
      <QRCode value={user.id} size={178} />
      <Text style={styles.qrText}>Scan at the event</Text>
    </Pressable>
    {currentEvent ? <EventRow event={currentEvent} onPress={() => setEventInfoOpen(true)} /> : <Card><Muted>No event is available on this device yet.</Muted></Card>}
    <Row>
      <View style={styles.summaryTile}><Text style={styles.summaryLabel}>My check-ins</Text><Text style={styles.summaryValue}>{personalRecords.length}</Text><Text style={styles.summaryDetail}>Saved on this device</Text></View>
      <View style={styles.summaryTile}><Text style={styles.summaryLabel}>Latest record</Text><Text numberOfLines={2} style={styles.summaryDetail}>{latestPersonalRecord?.event || 'No record yet'}</Text>{latestPersonalRecord && <Muted>{latestPersonalRecord.date} / {latestPersonalRecord.time}</Muted>}</View>
    </Row>
    <Button secondary disabled={busy || !online} onPress={() => run(refreshStudentAttendance, count => setNotice(`Attendance refreshed. ${count} synced record(s) found.`))}>
      {busy ? 'Refreshing...' : online ? 'Refresh my attendance' : 'Connect to refresh attendance'}
    </Button>
  </>;
  else if (screen === 'records') content = <><Field label="Search event" value={query} onChangeText={setQuery} />
    <Button secondary disabled={busy || !online} onPress={() => run(refreshStudentAttendance, count => setNotice(`Attendance refreshed. ${count} synced record(s) found.`))}>
      {busy ? 'Refreshing...' : online ? 'Refresh from server' : 'Offline / showing saved records'}
    </Button>
    <RecordList records={personalRecords.filter(r => `${r.event} ${r.date}`.toLowerCase().includes(query.toLowerCase()))} /></>;
  else if (screen === 'profile') content = <Card>
    <Ionicons name="person-circle-outline" size={48} color={colors.yellow} />
    <Title>{user.name}</Title>
    <View style={styles.dataRow}><Text style={styles.dataLabel}>Student ID</Text><Text style={styles.dataValue}>{user.id}</Text></View>
    <View style={styles.dataRow}><Text style={styles.dataLabel}>Section</Text><Text style={styles.dataValue}>{user.section}</Text></View>
    <Button secondary onPress={requestLogout}>Logout</Button>
  </Card>;
  else if (screen === 'admin-home') content = <>
    <View style={styles.screenLead}><Text style={styles.greeting}>Good day,</Text><Text style={styles.greetingName}>{user.name}</Text></View>
    <Metrics items={[["Present today", todayRecords.filter(r => r.status === 'PRESENT').length], ['Pending sync', pending]]} />
    <Button icon={currentEvent ? 'scan-outline' : 'calendar-outline'} onPress={() => currentEvent ? go('scanner', { eventId: currentEvent.id }) : go('create-event')}>{currentEvent ? 'Start scanning' : 'Create event to scan'}</Button>
    {currentEvent ? <EventRow event={currentEvent} onPress={() => go('event', { eventId: currentEvent.id })} /> : <Card><Muted>No current event. Create one from Organizer tools.</Muted></Card>}
    <RecentActivity records={data.records.slice(0, 4)} onSeeAll={() => go('admin-records')} />
    <Card><Title>Organizer tools</Title>
      <Button onPress={() => go('create-event')}>Create event</Button>
      <Button secondary onPress={() => go('roster-import')}>Import faculty roster</Button>
      <Button secondary onPress={() => go('history')}>View events</Button>
    </Card>
    <Card><Title>Sync to server</Title><Muted>{pending} attendance record{pending === 1 ? '' : 's'} waiting. Upload rosters and events too when the server is available.</Muted>
      <Button disabled={busy || !online} onPress={() => setSyncOpen(true)}>Upload now</Button></Card>
  </>;
  else if (screen === 'admin-records') content = <RecordList records={data.records} />;
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
  else if (screen === 'receipt' && receipt) content = <>
    <View style={styles.receiptPreview}>
      <View style={styles.receiptQr}><QRCode value={receipt.studentId} size={140} /><Text style={styles.qrText}>{receipt.studentId}</Text></View>
      <ScanCorners />
    </View>
    <View style={styles.successBanner}><Ionicons name="checkmark-circle" size={27} color={colors.black} /><Text style={styles.successText}>ATTENDANCE RECORDED</Text></View>
    <Card>
      <View style={styles.dataRow}><Text style={styles.dataLabel}>Student</Text><Text style={styles.dataValue}>{receipt.studentName} / {receipt.studentId}</Text></View>
      <View style={styles.dataRow}><Text style={styles.dataLabel}>Event</Text><Text style={styles.dataValue}>{receipt.event}</Text></View>
      <View style={styles.dataRow}><Text style={styles.dataLabel}>Time</Text><Text style={styles.dataValue}>{receipt.time}</Text></View>
      <Muted>{methodLabel(receipt.method)} / Saved locally</Muted>
    </Card>
    <Button icon="scan-outline" onPress={() => replace('scanner', { eventId: receipt.eventId })}>Scan next</Button>
    <Button secondary onPress={() => replace('event', { eventId: receipt.eventId })}>Done</Button>
  </>;
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
        {user.role === 'student' && <NavItem active={screen === 'profile'} icon={screen === 'profile' ? 'person-circle' : 'person-circle-outline'} label="Profile" onPress={() => replace('profile')} />}
        {user.role === 'admin' && <NavItem active={screen === 'history'} icon={screen === 'history' ? 'calendar' : 'calendar-outline'} label="Events" onPress={() => replace('history')} />}
        {user.role === 'admin' && <NavItem active={screen === 'admin-records'} icon={screen === 'admin-records' ? 'document-text' : 'document-text-outline'} label="Records" onPress={() => replace('admin-records')} />}
        {user.role === 'admin' && <NavItem icon="log-out-outline" label="Logout" onPress={requestLogout} />}
      </View>}
    </View>
    {qrOpen && <ModalFrame title="My attendance QR" onClose={() => setQrOpen(false)}><View style={styles.qr}><QRCode value={user.id} size={Math.max(120, Math.min(width - 120, 260))} /><Text style={styles.qrText}>Student ID: {user.id}</Text><Text style={styles.qrText}>{user.name}</Text></View></ModalFrame>}
    {eventInfoOpen && currentEvent && <ModalFrame title="Event details" onClose={() => setEventInfoOpen(false)}><EventSummary event={currentEvent} /></ModalFrame>}
    {confirm && <ModalFrame title={confirm.title} onClose={() => setConfirm(null)} busy={busy}><Muted>{confirm.message}</Muted><ErrorText>{error}</ErrorText><Button disabled={busy} onPress={confirm.action}>{busy ? 'Saving...' : 'Confirm'}</Button><Button secondary disabled={busy} onPress={() => setConfirm(null)}>Cancel</Button></ModalFrame>}
    {syncOpen && <ModalFrame title="Upload to server" onClose={() => { setSyncOpen(false); setSyncPassword(''); }} busy={busy}>
      <Muted>Enter the organizer password configured on the server. Rosters, events, and attendance will be uploaded.</Muted>
      <Field label="Server organizer password" password value={syncPassword} onChangeText={setSyncPassword} />
      <ErrorText>{error}</ErrorText>
      <Button disabled={busy || !syncPassword} onPress={() => run(async () => {
        const result = await syncToServer(data, user, syncPassword, process.env.EXPO_PUBLIC_API_URL);
        await update(current => markSynced(current, result.acceptedRecordIds));
        return result;
      }, result => {
        setSyncPassword(''); setSyncOpen(false);
        setNotice(`Upload complete. ${result.acceptedRecordIds.length} attendance record(s) synced.${result.conflictRecordIds.length ? ` ${result.conflictRecordIds.length} duplicate(s) stayed on this device.` : ''}`);
      })}>{busy ? 'Uploading...' : 'Upload data'}</Button>
    </ModalFrame>}
  </SafeAreaView>;
}
