import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, colors, ErrorText, Field, Muted, Row, styles, Title } from './ui';
import { useApp } from './state';
import { importRoster, MAX_ROSTER_BYTES, parseRoster, rosterSummary } from './roster.mjs';
import { parseSpreadsheet } from './spreadsheet.mjs';
import { uploadRosterToServer } from './remote-sync.mjs';

export default function RosterImport() {
  const { data, user, update } = useApp();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [serverPassword, setServerPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const summary = preview ? rosterSummary(data, preview.rows) : null;
  const existingIds = new Set([...data.students, ...data.admins].map(account => account.id));
  async function choose() {
    setError(''); setResult(''); setPreview(null);
    try {
      // Android grants access to the picked content URI; its Expo Go cache copy can be unreadable.
      const selected = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: Platform.OS !== 'android', base64: false });
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
    {!preview && <>
      <Title>Choose a faculty roster</Title>
      <Muted>CSV or Excel (.xlsx, .xls). Required: student_id, name, section. Email is optional.</Muted>
      <Muted>For Excel, put the roster on the first sheet and format student IDs as text.</Muted>
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
      <Muted>Internet is required. The roster is uploaded to PostgreSQL before it is saved on this phone.</Muted>
      <Field label="Organizer server password" password value={serverPassword} onChangeText={setServerPassword} />
      <View style={styles.localPill}><Ionicons name="alert-circle-outline" size={18} color={colors.yellow} /><Text style={styles.localPillText}>Existing accounts and passwords stay unchanged.</Text></View>
      <Button disabled={busy || !serverPassword} onPress={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        let uploadedToServer = false;
        try {
          const remoteCounts = await uploadRosterToServer(preview.rows, user, serverPassword, process.env.EXPO_PUBLIC_API_URL);
          uploadedToServer = true;
          let localCounts;
          await update(current => {
            localCounts = rosterSummary(current, preview.rows);
            return importRoster(current, user, preview.rows);
          });
          setResult(`Roster uploaded. ${remoteCounts.added} new students added; ${remoteCounts.skipped} existing IDs kept. This device saved ${localCounts.added} local account(s).`);
          setServerPassword('');
          setPreview(null);
        } catch (e) {
          setError(uploadedToServer
            ? 'The server roster was uploaded, but this phone could not save its local copy. Retry the import; existing server accounts will be kept.'
            : e.message || 'Roster upload failed. This phone did not import the roster.');
        }
        finally { lock.current = false; setBusy(false); }
      }}>{busy ? 'Uploading roster...' : 'Upload and import roster'}</Button>
      <Button secondary disabled={busy} onPress={() => { setPreview(null); setServerPassword(''); }}>Cancel import</Button>
    </>}
    <ErrorText>{error}</ErrorText>
    {!!result && <Text accessibilityRole="alert" style={{ color: colors.yellow, fontWeight: '700' }}>{result}</Text>}
  </Card>;
}
