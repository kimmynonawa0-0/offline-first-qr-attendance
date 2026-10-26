import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, colors, ErrorText, Muted, Row, styles, Title } from './ui';
import { useApp } from './state';
import { importRoster, MAX_ROSTER_BYTES, parseRoster, rosterSummary } from './roster.mjs';
import { parseSpreadsheet } from './spreadsheet.mjs';
import { loginStudentRemotely, uploadRosterToServer } from './remote-sync.mjs';
import { authorizeRosterUpload } from './roster-upload-session.mjs';

export default function RosterImport() {
  const { data, user, update, webCredential, adminSession, setAdminSession, online } = useApp();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const summary = preview ? rosterSummary(data, preview.rows) : null;
  const existingIds = new Set([...data.students, ...data.admins].map(account => account.id));
  const sectionRoster = data.students
    .filter(student => student.section === user.section)
    .sort((left, right) => left.id.localeCompare(right.id));
  async function choose() {
    setError(''); setResult(''); setPreview(null);
    try {
      // Copy the picked document into app cache so Expo FileSystem can read it on Android.
      const selected = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true, base64: false });
      if (selected.canceled) return;
      const asset = selected.assets[0];
      const extension = asset.name?.match(/\.(csv|xlsx|xls)$/i)?.[1]?.toLowerCase();
      if (!extension) throw new Error('Choose a .csv, .xlsx, or .xls roster.');
      if (asset.size > MAX_ROSTER_BYTES) throw new Error('Roster file must be no larger than 1 MB.');
      const file = Platform.OS === 'web' ? (asset.file || await (await fetch(asset.uri)).blob()) : new File(asset.uri);
      if ((asset.size ?? file.size) > MAX_ROSTER_BYTES) throw new Error('Roster file must be no larger than 1 MB.');
      const rows = extension === 'csv' ? parseRoster(await file.text()) : parseSpreadsheet(await file.arrayBuffer());
      setPreview({ name: asset.name, rows });
    } catch (e) {
      setError(/Missing 'READ' permission/.test(e.message || '')
        ? 'Cannot read this file. Select it again from your phone\'s Files app.'
        : e.message || 'Could not read this file. Please select a CSV or Excel roster.');
    }
  }
  return <Card>
    <Title>Current section roster</Title>
    <Muted>{sectionRoster.length} student{sectionRoster.length === 1 ? '' : 's'} available on this device from {user.section || 'your assigned section'}.</Muted>
    {sectionRoster.length ? sectionRoster.map(student => <View key={student.id} style={styles.rosterRow}>
      <Text style={styles.rosterId}>{student.id}</Text><Text numberOfLines={2} style={styles.rosterName}>{student.name}</Text>
    </View>) : <Muted>No section roster is saved yet. Upload a roster or sign in online to download it.</Muted>}
    {!preview && <>
      <Title>Choose a faculty roster</Title>
      <Muted>CSV or Excel (.xlsx, .xls). Required: student_id, name, section. Email is optional.</Muted>
      <Muted>For Excel, put the roster on the first sheet and format student IDs as text.</Muted>
      <Muted>This organizer can upload students only for {user.section || 'their assigned section'}.</Muted>
      <Button disabled={busy} onPress={choose}>Choose roster file</Button>
      <Muted>New students use their section as a temporary password. Existing accounts stay unchanged.</Muted>
    </>}
    {preview && <>
      <View style={styles.fileRow}>
        <Ionicons name="document-outline" size={29} color={colors.ink} />
        <View style={{ flex: 1 }}><Title>{preview.name}</Title><Muted>{preview.rows.length} records</Muted></View>
      </View>
      <View accessible accessibilityLabel={`${summary.added} new / ${summary.skipped} existing`}>
        <Row>
          <View style={styles.metric}><Text style={styles.metricValue}>{summary.added}</Text><Muted>New</Muted></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{summary.skipped}</Text><Muted>Existing</Muted></View>
        </Row>
      </View>
      <View style={styles.rosterHeader}>
        <Text style={styles.rosterId}>Student ID</Text><Text style={styles.rosterName}>Name</Text><Text style={styles.rosterStatus}>Status</Text>
      </View>
      {preview.rows.slice(0, 5).map(row => <View key={row.id} style={styles.rosterRow}>
        <Text style={styles.rosterId}>{row.id}</Text><Text numberOfLines={2} style={styles.rosterName}>{row.name}</Text>
        <Text style={styles.rosterStatus}>{existingIds.has(row.id) ? 'Existing' : 'New'}</Text>
      </View>)}
      {preview.rows.length > 5 && <Muted>Showing the first 5 of {preview.rows.length} students.</Muted>}
      <Muted>Upload requires internet. The server checks your organizer access and section before saving this roster.</Muted>
      {online !== true && <ErrorText>Connect to the internet before uploading. Your selected file is only being previewed on this device.</ErrorText>}
      {(!adminSession || adminSession.id !== user.id || !adminSession.token)
        && <Muted>Your signed-in account will authorize this upload. If its server session needs renewal, the app will renew it automatically.</Muted>}
      <View style={styles.localPill}><Ionicons name="alert-circle-outline" size={18} color={colors.yellow} /><Text style={styles.localPillText}>Existing accounts and passwords stay unchanged.</Text></View>
      <Button disabled={busy || online !== true} onPress={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        let uploadedToServer = false;
        try {
          let session = adminSession?.id === user.id ? adminSession : null;
          if (!session?.token || session.role && session.role !== 'admin') {
            const credential = webCredential?.id === user.id && webCredential.role === 'admin' ? webCredential.password : null;
            if (!credential) throw new Error('Your server session is unavailable. Sign in online again to continue.');
            const account = await loginStudentRemotely(user.id, credential, process.env.EXPO_PUBLIC_API_URL, fetch,
              session?.token);
            if (account.role !== 'admin') throw new Error('This account is not an event organizer.');
            session = { id: user.id, role: 'admin', token: account.sessionToken };
            await setAdminSession(session);
          }
          const authorization = await authorizeRosterUpload({
            user,
            session,
            online: online === true,
          });
          let remoteCounts;
          try {
            remoteCounts = await uploadRosterToServer(preview.rows, user, authorization.token, process.env.EXPO_PUBLIC_API_URL);
          } catch (uploadError) {
            const credential = webCredential?.id === user.id && webCredential.role === 'admin' ? webCredential.password : null;
            if (uploadError.status !== 401 || !credential) throw uploadError;
            const account = await loginStudentRemotely(user.id, credential, process.env.EXPO_PUBLIC_API_URL, fetch, authorization.token);
            if (account.role !== 'admin') throw new Error('This account is not an event organizer.');
            session = { id: user.id, role: 'admin', token: account.sessionToken };
            await setAdminSession(session);
            remoteCounts = await uploadRosterToServer(preview.rows, user, session.token, process.env.EXPO_PUBLIC_API_URL);
          }
          uploadedToServer = true;
          let localCounts;
          await update(current => {
            localCounts = rosterSummary(current, preview.rows);
            return importRoster(current, user, preview.rows);
          });
          setResult(`Roster uploaded. ${remoteCounts.added} new students added; ${remoteCounts.skipped} existing IDs kept. This device saved ${localCounts.added} local account(s).`);
          setPreview(null);
        } catch (e) {
          if (Platform.OS === 'web' && e.status === 401) await setAdminSession(null);
          setError(uploadedToServer
            ? 'The server roster was uploaded, but this device could not save its local copy. Retry the import; existing server accounts will be kept.'
            : e.message || 'Could not confirm the server upload. Retry while online; existing server accounts will be kept.');
        }
        finally { lock.current = false; setBusy(false); }
      }}>{busy ? 'Uploading roster...' : 'Upload roster to server'}</Button>
      <Button secondary disabled={busy} onPress={() => setPreview(null)}>Cancel import</Button>
    </>}
    <ErrorText>{error}</ErrorText>
    {!!result && <Text accessibilityRole="alert" style={{ color: colors.yellow, fontWeight: '700' }}>{result}</Text>}
  </Card>;
}
