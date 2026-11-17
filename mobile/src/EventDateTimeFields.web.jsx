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

function WebField({ label, ariaLabel, type: inputType, value, onChange, disabled }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <input
      type={inputType}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      style={inputStyle(disabled)}
    />
  </View>;
}

export default function EventDateTimeFields({ date, time, end, onChangeDate, onChangeTime, onChangeEnd, disabled = false }) {
  return <View style={styles.wrap}>
    <WebField label="Date" ariaLabel="Event date" type="date" value={date} onChange={onChangeDate} disabled={disabled} />
    <WebField label="Start time" ariaLabel="Event start time" type="time" value={time} onChange={onChangeTime} disabled={disabled} />
    <WebField label="End time" ariaLabel="Event end time" type="time" value={end} onChange={onChangeEnd} disabled={disabled} />
  </View>;
}

const styles = {
  wrap: { gap: space.sm, marginBottom: space.sm },
  field: { marginBottom: space.xs },
  label: { color: colors.paper, fontSize: type.caption, letterSpacing: 0.4, fontWeight: '700', marginBottom: 6 },
};
