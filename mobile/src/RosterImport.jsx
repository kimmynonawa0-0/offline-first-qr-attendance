import { useRef, useState } from 'react';
import { Platform, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Button, Card, ErrorText, Muted, Title } from './ui';
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
    <Title>Import faculty roster</Title>
    <Muted>Export Excel or Google Sheets as CSV UTF-8. Required columns: student_id, name, section. Email is optional.</Muted>
    <Muted>New students start with their section as a temporary password. Existing IDs are skipped without changing passwords or roles.</Muted>
    <Muted>Prototype: imported accounts are available on this device only.</Muted>
    <Button secondary disabled={busy} onPress={choose}>Choose CSV file</Button>
    {preview && <>
      <Text>{preview.name}</Text>
      <Title>{summary.added} new / {summary.skipped} existing</Title>
      {preview.rows.slice(0, 5).map(row => <Muted key={row.id}>{row.id} | {row.name} | {row.section}</Muted>)}
      {preview.rows.length > 5 && <Muted>Showing the first 5 of {preview.rows.length} students.</Muted>}
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
    {!!result && <Text accessibilityRole="alert">{result}</Text>}
  </Card>;
}
