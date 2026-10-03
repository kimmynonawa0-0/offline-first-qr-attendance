import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, colors, ErrorText, Muted, Row, styles, Title } from './ui';
import { useApp } from './state';
import { importRoster, MAX_ROSTER_BYTES, parseRoster, rosterSummary } from './roster.mjs';

export default function RosterImport() {
  const { data, user, update } = useApp();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const summary = preview ? rosterSummary(data, preview.rows) : null;
  const existingIds = new Set([...data.students, ...data.admins].map(account => account.id));
  async function choose() {
    setError(''); setResult(''); setPreview(null);
    try {
      const selected = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true, base64: false });
      if (selected.canceled) return;
      const asset = selected.assets[0];
      if (!/\.csv$/i.test(asset.name)) throw new Error('Export the spreadsheet as CSV UTF-8 (.csv) first. Excel workbooks are not supported yet.');
      if (asset.size > MAX_ROSTER_BYTES) throw new Error('CSV must be no larger than 1 MB.');
      const text = Platform.OS === 'web' ? await asset.file.text() : await new File(asset.uri).text();
      setPreview({ name: asset.name, rows: parseRoster(text) });
    } catch (e) { setError(e.message || 'Could not read this file. Please select a CSV.'); }
  }
  return <Card>
    {!preview && <>
      <Title>Choose a CSV roster</Title>
      <Muted>Required columns: student_id, name, and section. Email is optional.</Muted>
      <Button disabled={busy} onPress={choose}>Choose CSV file</Button>
      <Muted>New students use their section as a temporary password. Existing accounts stay unchanged.</Muted>
    </>}
    {preview && <>
      <View style={styles.fileRow}>
        <Ionicons name="document-outline" size={29} color={colors.ink} />
        <View style={{ flex: 1 }}><Title>{preview.name}</Title><Muted>{preview.rows.length} records / CSV</Muted></View>
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
      <View style={styles.localPill}><Ionicons name="alert-circle-outline" size={18} color={colors.yellow} /><Text style={styles.localPillText}>Existing accounts stay unchanged.</Text></View>
      <Button disabled={busy || !summary.added} onPress={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        try {
          let counts;
          await update(current => {
            counts = rosterSummary(current, preview.rows);
            return importRoster(current, user, preview.rows);
          });
          setResult(`Imported ${counts.added} students. Skipped ${counts.skipped} existing IDs.`);
          setPreview(null);
        } catch (e) { setError(e.message || 'Import failed. No changes were saved.'); }
        finally { lock.current = false; setBusy(false); }
      }}>{busy ? 'Importing...' : 'Confirm import'}</Button>
      <Button secondary disabled={busy} onPress={() => setPreview(null)}>Cancel import</Button>
    </>}
    <ErrorText>{error}</ErrorText>
    {!!result && <Text accessibilityRole="alert" style={{ color: colors.yellow, fontWeight: '700' }}>{result}</Text>}
  </Card>;
}
