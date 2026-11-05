import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from './ui';
import { localDate } from './model.mjs';
import { formatTwelveHourTime } from './event-time.mjs';

function dateValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0)
    : new Date();
}

function timeValue(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  const selected = new Date();
  selected.setHours(match ? Number(match[1]) : 9, match ? Number(match[2]) : 0, 0, 0);
  return selected;
}

function displayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || '';
  return dateValue(value).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function displayTime(value) {
  return formatTwelveHourTime(value) || '';
}

function FieldRow({ icon, label, value, accessibilityLabel, testID, onPress, disabled }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityValue={{ text: value }}
    testID={testID}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.fieldRow, pressed && styles.fieldRowPressed, disabled && styles.fieldRowDisabled]}
  >
    <View style={styles.iconWrap}><Ionicons name={icon} size={18} color={colors.yellow} /></View>
    <View style={styles.fieldText}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
    <Ionicons name="chevron-down" size={16} color={colors.muted} />
  </Pressable>;
}

export default function EventDateTimeFields({ date, time, onChangeDate, onChangeTime, disabled = false }) {
  const [editing, setEditing] = useState(null);

  function pickDate(event, selected) {
    if (Platform.OS !== 'ios') setEditing(null);
    if (event.type === 'set' && selected) onChangeDate(localDate(selected));
  }

  function pickTime(event, selected) {
    if (Platform.OS !== 'ios') setEditing(null);
    if (event.type === 'set' && selected) {
      const hours = String(selected.getHours()).padStart(2, '0');
      const minutes = String(selected.getMinutes()).padStart(2, '0');
      onChangeTime(`${hours}:${minutes}`);
    }
  }

  const done = Platform.OS === 'ios' && editing;

  return <View style={styles.wrap}>
    <FieldRow
      icon="calendar-outline"
      label="Date"
      value={displayDate(date)}
      accessibilityLabel="Event date"
      testID="event-date-field"
      disabled={disabled}
      onPress={() => setEditing('date')}
    />
    <FieldRow
      icon="time-outline"
      label="Time"
      value={displayTime(time)}
      accessibilityLabel="Event time"
      testID="event-time-field"
      disabled={disabled}
      onPress={() => setEditing('time')}
    />
    {editing === 'date' && <DateTimePicker
      value={dateValue(date)}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      themeVariant="dark"
      accentColor={colors.yellow}
      onChange={pickDate}
    />}
    {editing === 'time' && <DateTimePicker
      value={timeValue(time)}
      mode="time"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      themeVariant="dark"
      accentColor={colors.yellow}
      onChange={pickTime}
    />}
    {done && <Pressable accessibilityRole="button" accessibilityLabel="Done choosing" onPress={() => setEditing(null)} style={styles.done}>
      <Text style={styles.doneText}>Done</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.sm },
  fieldRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    backgroundColor: colors.inputSurface,
  },
  fieldRowPressed: { borderColor: colors.controlBorder, backgroundColor: colors.panelRaised },
  fieldRowDisabled: { backgroundColor: colors.inputDisabled },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.accentSurface,
  },
  fieldText: { flex: 1, minWidth: 0, gap: 2 },
  fieldLabel: { color: colors.muted, fontSize: type.eyebrow, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  fieldValue: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  done: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.inputDisabled, borderWidth: 1, borderColor: colors.controlBorder },
  doneText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
});
