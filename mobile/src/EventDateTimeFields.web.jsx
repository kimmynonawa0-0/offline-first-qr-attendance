import { Text, View } from 'react-native';
import { colors, radius, space, type } from './ui';

function inputStyle(disabled) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 52,
    padding: '0 14px',
    border: `1px solid ${colors.inputBorder}`,
    borderRadius: radius.md,
    backgroundColor: disabled ? colors.inputDisabled : colors.inputSurface,
    color: disabled ? colors.muted : colors.ink,
    fontFamily: 'inherit',
    fontSize: 16,
    colorScheme: 'dark',
  };
}

function WebField({ label, type: inputType, value, onChange, disabled }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <input
      type={inputType}
      aria-label={label === 'Date' ? 'Event date' : 'Event time'}
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      style={inputStyle(disabled)}
    />
  </View>;
}

export default function EventDateTimeFields({ date, time, onChangeDate, onChangeTime, disabled = false }) {
  return <View style={styles.wrap}>
    <WebField label="Date" type="date" value={date} onChange={onChangeDate} disabled={disabled} />
    <WebField label="Time" type="time" value={time} onChange={onChangeTime} disabled={disabled} />
  </View>;
}

const styles = {
  wrap: { gap: space.sm, marginBottom: space.sm },
  field: { marginBottom: space.xs },
  label: { color: colors.paper, fontSize: type.caption, letterSpacing: 0.4, fontWeight: '700', marginBottom: 6 },
};
