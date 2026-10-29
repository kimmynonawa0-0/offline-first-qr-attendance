import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { eventForToday } from './today-event.mjs';
import { currentTwelveHourTime, formatTwelveHourTime, parseTwelveHourTime } from './event-time.mjs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import QRCode from 'react-native-qrcode-svg';
import { useApp } from './state';
import { ChangePasswordScreen, LoginScreen } from './Auth';
import RosterImport from './RosterImport';
import Scanner from './Scanner';
import { attendanceStatus, checkIn, createEvent, localDate, mergeOrganizerBootstrap, mergeStudentAttendance, methodLabel } from './model.mjs';
import { createOrganizerEvent, downloadOrganizerBootstrap, downloadStudentAttendance, loginStudentRemotely, logoutAdminRemotely, markSynced, syncOrganizerWithReauth } from './remote-sync.mjs';
import { getOfflineCredential } from './offline-auth.mjs';
import { serverRefreshScope } from './server-refresh.mjs';
import PullToRefreshScrollView from './PullToRefreshScrollView';
import { BrandMark, Button, Card, colors, ErrorText, Field, LinkButton, ModalFrame, Muted, Row, ScanCorners, styles, Title } from './ui';

const adminScreens = ['admin-home', 'admin-records', 'event', 'history', 'scanner', 'receipt', 'roster-import'];
const studentScreens = ['student-home', 'records', 'profile'];
const go = (page, params = {}) => router.push({ pathname: '/[page]', params: { page, ...params } });
const replace = (page, params = {}) => router.replace({ pathname: '/[page]', params: { page, ...params } });

const pageTitles = {
  'change-password': 'Security',
  'student-home': 'Student home',
  records: 'Attendance records',
  profile: 'Profile',
  event: 'Event details',
  history: 'Events',
  'admin-records': 'Attendance records',
  'roster-import': 'Upload section roster',
  scanner: 'Scan Attendance',
  receipt: 'Attendance recorded',
};

function HeaderBar({ screen, user, online, eventId, adminSession }) {
  const back = ['records', 'profile'].includes(screen) ? ['student-home']
    : ['admin-records', 'history', 'event', 'roster-import'].includes(screen) ? ['admin-home']
      : ['scanner', 'receipt'].includes(screen) ? ['event', { eventId }]
        : null;
  const serverSession = user?.role === 'admin' && adminSession?.id === user.id && Boolean(adminSession.token);
  const status = user?.role === 'admin' && !serverSession ? 'LOCAL MODE' : online ? 'ONLINE' : 'OFFLINE';
  return <View style={styles.header}>
    <View style={styles.headerLeading}>
      {back && <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => replace(back[0], back[1])} style={styles.headerBack}>
        <Ionicons name="arrow-back" size={24} color={colors.ink} />
      </Pressable>}
      {screen === 'admin-home' ? <BrandMark compact /> : <Text style={styles.pageTitle}>{pageTitles[screen] || 'NORWEScan'}</Text>}
    </View>
    <Text style={[styles.badge, status === 'OFFLINE' && { color: '#FF9B94', backgroundColor: '#281413', borderColor: '#74332F' }]}>
      {status}
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
  return <><Title>{event.name}</Title><Muted>{event.location}</Muted><Muted>{event.date} at {formatTwelveHourTime(event.time)}</Muted>
    {event.createdLocally && <Muted>LOCAL ONLY / Students have not been notified. This event uploads with attendance.</Muted>}
  </>;
}

function displayTime(value, fallback = 'Not recorded') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    <Muted>{record.date}</Muted>
    <Muted>Time In: {record.timeIn || record.time || displayTime(record.timeInAt || record.recordedAt)}</Muted>
    <Muted>Time Out: {record.timeOut || displayTime(record.timeOutAt)}</Muted>
    <Muted>Methods: {methodLabel(record.timeInMethod || record.method)}{record.timeOutAt ? ` / ${methodLabel(record.timeOutMethod)}` : ''}</Muted>
    <Text style={{ color: colors.yellow, fontWeight: '800' }}>{record.timeOutAt ? 'COMPLETED' : 'TIMED IN'} / {record.synced ? 'Synced' : 'Saved locally'}</Text>
  </Card>) : <Muted>No attendance records yet.</Muted>;
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
    <Muted>Time In: {a.time || displayTime(a.timeInAt)} / {methodLabel(a.method)}</Muted>
    <Muted>Time Out: {a.timeOut || displayTime(a.timeOutAt)}</Muted>
  </View>) : <Muted>No students checked in yet.</Muted>;
}

export default function AppScreen() {
  const { page: screen = 'login', eventId, recordId, scanMode = 'time-in' } = useLocalSearchParams();
  const focused = useIsFocused();
  const { data, user, setUser, webCredential, adminSession, setAdminSession, clearAdminSession, loading, error: storageError, load, update, online, notice, setNotice, startupRoute, consumeStartupRoute } = useApp();
  const [qrOpen, setQrOpen] = useState(false);
  const [eventInfoOpen, setEventInfoOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState(() => ({ name: '', location: '', date: localDate(), time: currentTwelveHourTime() }));
  const lock = useRef(false);
  const { width } = useWindowDimensions();
  useEffect(() => {
    if (!startupRoute) return;
    replace(startupRoute);
    consumeStartupRoute();
  }, [startupRoute, consumeStartupRoute]);
  const home = user?.role === 'admin' ? 'admin-home' : 'student-home';
  async function run(action, after) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { const result = await action(); after?.(result); }
    catch (e) { setError(e.message || 'Could not save. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function ensureServerSession(forceLogin = false) {
    const sessionMatches = adminSession?.id === user?.id
      && (!adminSession.role || adminSession.role === user?.role)
      && typeof adminSession.token === 'string' && adminSession.token;
    if (!forceLogin && sessionMatches) return adminSession.token;
    const password = Platform.OS === 'web'
      ? webCredential?.id === user?.id && webCredential?.role === user?.role ? webCredential.password : null
      : await getOfflineCredential(SecureStore, user?.role, user?.id);
    if (!password) throw new Error('Your server session is unavailable. Sign in online again to continue.');
    const account = await loginStudentRemotely(user.id, password, process.env.EXPO_PUBLIC_API_URL,
      fetch, sessionMatches ? adminSession.token : undefined);
    if (account.role !== user.role) throw new Error('The signed-in account no longer has access to this app.');
    await setAdminSession({ id: user.id, role: user.role, token: account.sessionToken });
    return account.sessionToken;
  }
  async function withServerSession(action) {
    let token = await ensureServerSession();
    try { return await action(token); }
    catch (error) {
      if (error.status !== 401) throw error;
      token = await ensureServerSession(true);
      return action(token);
    }
  }
  async function refreshCurrentScreen() {
    if (!canPullToRefresh || lock.current) return;
    if (online === false) {
      setNotice('You are offline. Showing the records saved on this device.');
      return;
    }
    setRefreshing(true);
    try {
      await run(async () => {
        if (refreshScope === 'student-attendance') {
          const records = await withServerSession(token => downloadStudentAttendance(user, token, process.env.EXPO_PUBLIC_API_URL));
          await update(current => mergeStudentAttendance(current, user.id, records));
          return { kind: 'student', count: records.length };
        }
        const bootstrap = await withServerSession(token => downloadOrganizerBootstrap(token, process.env.EXPO_PUBLIC_API_URL));
        await update(current => mergeOrganizerBootstrap(current, bootstrap));
        return { kind: 'organizer', records: bootstrap.attendance?.length || 0, events: bootstrap.events.length };
      }, result => setNotice(result.kind === 'student'
        ? `Attendance updated. ${result.count} server record(s) found.`
        : `Events and attendance updated. ${result.events} assigned event(s), ${result.records} server record(s).`));
    } finally {
      setRefreshing(false);
    }
  }
  function requestLogout() {
    setConfirm({ title: 'Log out?', message: 'Your records will remain saved on this device.', action: async () => {
      if (adminSession?.id === user.id) {
        void logoutAdminRemotely(adminSession.token, process.env.EXPO_PUBLIC_API_URL).catch(() => {});
      }
      try {
        await clearAdminSession();
        await setUser(null);
        setConfirm(null); router.replace('/');
      } catch { setError('Could not clear the saved sign-in safely. You are still signed in. Please try again.'); }
    } });
  }
  if (loading || !data) return <SafeAreaView style={styles.safe}><View style={{ padding: 24 }}>
    <BrandMark />{loading ? <ActivityIndicator color={colors.yellow} /> : <><ErrorText>{storageError}</ErrorText><Button onPress={load}>Retry loading</Button></>}
  </View></SafeAreaView>;
  const authScreen = ['login', 'student-login', 'admin-login'].includes(screen);
  if (startupRoute && ['scanner', 'receipt'].includes(screen)) return focused ? <Redirect href={`/${startupRoute}`} /> : null;
  const account = user && data[user.role === 'admin' ? 'admins' : 'students'].find(a => a.id === user.id);
  const mustChange = Boolean(account?.mustChangePassword);
  const refreshScope = serverRefreshScope(screen, user?.role);
  const canPullToRefresh = Boolean(refreshScope && !mustChange);
  if (!authScreen && !user) return focused ? <Redirect href="/" /> : null;
  if (user && mustChange && screen !== 'change-password') return focused ? <Redirect href="/change-password" /> : null;
  if (user && !mustChange && screen === 'change-password') return focused ? <Redirect href={`/${home}`} /> : null;
  if (screen === 'roster-import' && Platform.OS !== 'web') return focused ? <Redirect href={`/${home}`} /> : null;
  if (user && (authScreen || (adminScreens.includes(screen) && user.role !== 'admin') || (studentScreens.includes(screen) && user.role !== 'student'))) {
    return focused ? <Redirect href={`/${home}`} /> : null;
  }
  const assignedEvents = user?.role === 'admin' ? data.events.filter(item => item.assignedToOrganizer) : data.events;
  const event = assignedEvents.find(e => e.id === eventId);
  const personalRecords = user ? data.records.filter(r => r.studentId === user.id) : [];
  const currentEvent = eventForToday(assignedEvents);
  const todayRecords = data.records.filter(r => r.date === localDate());
  const pending = data.records.filter(r => !r.synced).length;
  const ownAttendance = event?.attendees.find(a => a.id === user?.id);
  const receipt = data.records.find(r => r.id === recordId);
  const latestPersonalRecord = personalRecords[0];

  let content;
  if (authScreen) content = <LoginScreen
    onLogin={async account => { await setUser(account); replace(account.mustChangePassword ? 'change-password' : account.role === 'admin' ? 'admin-home' : 'student-home'); }} />;
  else if (screen === 'change-password') content = <ChangePasswordScreen
    onComplete={async account => { await setUser(account); replace(account.role === 'admin' ? 'admin-home' : 'student-home'); }}
    onLogout={async () => {
      if (adminSession?.id === user.id) {
        void logoutAdminRemotely(adminSession.token, process.env.EXPO_PUBLIC_API_URL).catch(() => {});
      }
      await clearAdminSession(); await setUser(null); router.replace('/');
    }} />;
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
  </>;
  else if (screen === 'records') content = <><Field label="Search event" value={query} onChangeText={setQuery} />
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
    <Button icon="scan-outline" onPress={() => currentEvent ? go('scanner', { eventId: currentEvent.id }) : setNotice("There's no event for today.")}>Start scanning</Button>
    {currentEvent ? <EventRow event={currentEvent} onPress={() => go('event', { eventId: currentEvent.id })} /> : <Card><Muted>There&apos;s no event for today.</Muted></Card>}
    <RecentActivity records={data.records.slice(0, 4)} onSeeAll={() => go('admin-records')} />
    <Card><Title>Organizer tools</Title>
      <Button secondary onPress={() => go('history')}>View assigned events</Button>
      {Platform.OS === 'web' && <Button secondary onPress={() => go('roster-import')}>Upload section roster</Button>}
    </Card>
    <Card><Title>Sync attendance</Title><Muted>{pending} attendance record{pending === 1 ? '' : 's'} waiting.</Muted>
      <Button disabled={busy || !online} onPress={() => setSyncOpen(true)}>Upload now</Button></Card>
  </>;
  else if (screen === 'roster-import') content = <RosterImport />;
  else if (screen === 'admin-records') content = <>
    <RecordList records={data.records} />
  </>;
  else if (screen === 'history') content = <>
    <Button icon="add-outline" onPress={() => setCreateEventOpen(true)}>Create event</Button>
    <History events={assignedEvents} onManage={id => go('event', { eventId: id })} />
  </>;
  else if (screen === 'event' && event) content = <>
    <Card admin><EventSummary event={event} />
      <Button purple onPress={() => go('scanner', { eventId, scanMode: 'time-in' })}>Scan Time In</Button>
      <Button secondary onPress={() => go('scanner', { eventId, scanMode: 'time-out' })}>Scan Time Out</Button>
    </Card>
    <Card><Title>My attendance</Title><Muted>{user.name} ({user.id})</Muted>
      <Muted>Time In: {ownAttendance?.time || displayTime(ownAttendance?.timeInAt)}</Muted>
      <Muted>Time Out: {ownAttendance?.timeOut || displayTime(ownAttendance?.timeOutAt)}</Muted>
      <Button disabled={busy || attendanceStatus(data, eventId, user.id).status === 'completed'} onPress={() => run(() => update(d => checkIn(d, user, eventId, user, 'organizer', Crypto.randomUUID(), attendanceStatus(data, eventId, user.id).status === 'not-in' ? 'time-in' : 'time-out')), () => setNotice(attendanceStatus(data, eventId, user.id).status === 'not-in' ? 'Time In recorded.' : 'Time Out recorded.'))}>{attendanceStatus(data, eventId, user.id).status === 'not-in' ? 'Check myself in (Time In)' : attendanceStatus(data, eventId, user.id).status === 'timed-in' ? 'Check myself out (Time Out)' : 'Attendance complete'}</Button>
      <Button secondary onPress={() => setQrOpen(true)}>My QR</Button><Muted>Self check-in is recorded as organizer attendance.</Muted>
    </Card>
    <Card><Title>Attendees ({event.attendees.length})</Title><Attendees event={event} /></Card>
  </>;
  else if (screen === 'scanner' && event) content = <Scanner data={data} eventId={eventId} initialMode={scanMode} busy={busy} onSave={(person, method, action) => {
    const id = action === 'time-in'
      ? Crypto.randomUUID()
      : attendanceStatus(data, eventId, person.id).record?.id;
    run(() => update(d => checkIn(d, user, eventId, person, method, id, action)), () => replace('receipt', { eventId, recordId: id, scanMode: action }));
  }} />;
  else if (screen === 'receipt' && receipt) content = <>
    <View style={styles.receiptPreview}>
      <View style={styles.receiptQr}><QRCode value={receipt.studentId} size={140} /><Text style={styles.qrText}>{receipt.studentId}</Text></View>
      <ScanCorners />
    </View>
    <View style={styles.successBanner}><Ionicons name="checkmark-circle" size={27} color={colors.black} /><Text style={styles.successText}>{receipt.timeOutAt ? 'TIME OUT RECORDED' : 'TIME IN RECORDED'}</Text></View>
    <Card>
      <View style={styles.dataRow}><Text style={styles.dataLabel}>Student</Text><Text style={styles.dataValue}>{receipt.studentName} / {receipt.studentId}</Text></View>
      <View style={styles.dataRow}><Text style={styles.dataLabel}>Event</Text><Text style={styles.dataValue}>{receipt.event}</Text></View>
      <Muted>Time In: {receipt.timeIn || receipt.time}</Muted>
      <Muted>Time Out: {receipt.timeOut || displayTime(receipt.timeOutAt)}</Muted>
      <Muted>{receipt.timeOutAt ? `${methodLabel(receipt.timeOutMethod)} / ` : ''}${methodLabel(receipt.timeInMethod || receipt.method)} / Saved locally</Muted>
    </Card>
    <Button icon="scan-outline" onPress={() => replace('scanner', { eventId: receipt.eventId, scanMode })}>Scan next</Button>
    <Button secondary onPress={() => replace('event', { eventId: receipt.eventId })}>Done</Button>
  </>;
  else content = <Card><Title>Page or event not found</Title><Button onPress={() => replace(home)}>Back to dashboard</Button></Card>;

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <View style={styles.container}>
      {!authScreen && <HeaderBar screen={screen} user={user} online={online} eventId={eventId} adminSession={adminSession} />}
      {!!notice && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setNotice('')} style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></Pressable>}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <PullToRefreshScrollView
          enabled={canPullToRefresh}
          refreshing={refreshing}
          onRefresh={refreshCurrentScreen}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          <ErrorText>{error}</ErrorText>{content}
        </PullToRefreshScrollView>
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
    {createEventOpen && <ModalFrame title="Create event" onClose={() => setCreateEventOpen(false)} busy={busy}>
      <Muted>Create an event for your organizer account. If you are offline, it stays on this device and students will not see a notification. Share the event in your group chat; it will upload with scanned attendance when you have internet.</Muted>
      <Field label="Event name" value={eventDraft.name} onChangeText={name => setEventDraft(current => ({ ...current, name }))} placeholder="e.g. Department assembly" />
      <Field label="Location" value={eventDraft.location} onChangeText={location => setEventDraft(current => ({ ...current, location }))} placeholder="e.g. Main hall" />
      <Field label="Date (YYYY-MM-DD)" value={eventDraft.date} onChangeText={date => setEventDraft(current => ({ ...current, date }))} />
      <Field label="Event time (AM/PM)" value={eventDraft.time} onChangeText={time => setEventDraft(current => ({ ...current, time }))} placeholder="e.g. 2:30 PM" />
      <Button disabled={busy} onPress={() => run(async () => {
        const id = Crypto.randomUUID();
        const localEvent = createEvent(data, user, { ...eventDraft, time: parseTwelveHourTime(eventDraft.time) }, id).events.at(-1);
        let createdLocally = false;
        if (!online) createdLocally = true;
        else {
          try {
            await withServerSession(token => createOrganizerEvent(localEvent, user, token, process.env.EXPO_PUBLIC_API_URL));
          } catch (error) {
            if (!error.retryable) throw error;
            createdLocally = true;
          }
        }
        await update(current => ({ ...current, events: [...current.events, {
          ...localEvent, assignedToOrganizer: true, ...(createdLocally ? { createdLocally: true } : {}),
        }] }));
        return { createdLocally };
      }, result => {
        setCreateEventOpen(false);
        setEventDraft({ name: '', location: '', date: localDate(), time: currentTwelveHourTime() });
        setNotice(result.createdLocally
          ? 'Event saved on this device only. Students will not be notified; share it in your group chat. It will upload with attendance.'
          : 'Event created and published.');
      })}>{busy ? 'Saving...' : 'Create event'}</Button>
      <Button secondary disabled={busy} onPress={() => setCreateEventOpen(false)}>Cancel</Button>
    </ModalFrame>}
    {confirm && <ModalFrame title={confirm.title} onClose={() => setConfirm(null)} busy={busy}><Muted>{confirm.message}</Muted><ErrorText>{error}</ErrorText><Button disabled={busy} onPress={confirm.action}>{busy ? 'Saving...' : 'Confirm'}</Button><Button secondary disabled={busy} onPress={() => setConfirm(null)}>Cancel</Button></ModalFrame>}
    {syncOpen && <ModalFrame title="Upload to server" onClose={() => setSyncOpen(false)} busy={busy}>
      <Muted>Your signed-in organizer session will authorize this upload. Rosters, events, and attendance will be sent to PostgreSQL.</Muted>
      <ErrorText>{error}</ErrorText>
      <Button disabled={busy} onPress={() => run(async () => {
        const result = await withServerSession(token => syncOrganizerWithReauth(data, user, token, process.env.EXPO_PUBLIC_API_URL));
        await update(current => markSynced(current, result.acceptedRecordIds, result.acceptedEventIds));
        return result;
      }, result => {
        setSyncOpen(false);
        setNotice(`Upload complete. ${result.acceptedEventIds.length} created event(s) and ${result.acceptedRecordIds.length} attendance record(s) synced.${result.conflictRecordIds.length ? ` ${result.conflictRecordIds.length} duplicate(s) stayed on this device.` : ''}`);
      })}>{busy ? 'Uploading...' : 'Upload'}</Button>
    </ModalFrame>}
  </SafeAreaView>;
}
