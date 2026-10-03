import { useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export const colors = {
  yellow: '#FFD21A',
  yellowDeep: '#E4AE00',
  black: '#070909',
  panel: '#111313',
  panelRaised: '#181A1A',
  line: '#343737',
  paper: '#F4F1E8',
  ink: '#F7F7F2',
  muted: '#A9ACA8',
  red: '#FF6B63',
  green: '#FFD21A',
  dark: '#070909',
  light: '#24230F',
  purple: '#FFD21A',
  background: '#070909',
};

const displayFont = Platform.select({
  ios: 'AvenirNextCondensed-Bold',
  android: 'sans-serif-condensed',
  web: 'Arial Narrow, sans-serif',
});

export function BrandMark({ compact = false }) {
  return <View style={[styles.brandCrop, compact && styles.brandCropCompact]}>
    <Image
      accessibilityLabel="NORWEScan"
      source={require('../assets/norwescan-wordmark.png')}
      resizeMode="cover"
      style={[styles.brandImage, compact && styles.brandImageCompact]}
    />
  </View>;
}

export function UniversityBanner() {
  return <View style={styles.heroFrame}>
    <LinearGradient colors={['#151817', '#090B0B', '#050606']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroGridOne} />
      <View style={styles.heroGridTwo} />
      <View style={styles.heroSlash} />
      <BrandMark />
      <Text style={styles.heroTitle}>Attendance,{ '\n' }<Text style={styles.heroAccent}>without the wait.</Text></Text>
    </LinearGradient>
  </View>;
}

export function Button({ children, onPress, icon, secondary = false, purple = false, danger = false, disabled = false }) {
  const primary = !secondary && !danger;
  const iconColor = primary ? colors.black : danger ? '#FF9B94' : colors.ink;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={typeof children === 'string' ? children : undefined}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      secondary && styles.buttonSecondary,
      danger && styles.buttonDanger,
      purple && styles.buttonPrimary,
      (pressed || disabled) && styles.buttonMuted,
    ]}
  >
    {primary
      ? <LinearGradient colors={['#FFE22E', colors.yellow, '#F5BD00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonFill}>
        {icon && <Ionicons testID="button-icon" name={icon} size={23} color={iconColor} />}
        <Text style={styles.buttonText}>{children}</Text>
      </LinearGradient>
      : <View style={styles.buttonFill}>
        {icon && <Ionicons testID="button-icon" name={icon} size={23} color={iconColor} />}
        <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, danger && styles.buttonTextDanger]}>{children}</Text>
      </View>}
  </Pressable>;
}

export function LinkButton({ children, onPress, disabled }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.linkHit, pressed && styles.buttonMuted]}>
    <Text style={styles.link}>{children}</Text>
  </Pressable>;
}

export function Field({ label, value, onChangeText, password = false, email = false, editable = true, placeholder, ...props }) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputRow, !editable && styles.inputDisabled]}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor="#717572"
        autoCapitalize={email || password ? 'none' : 'sentences'}
        autoCorrect={!email && !password}
        keyboardType={email ? 'email-address' : 'default'}
        secureTextEntry={password && !visible}
        selectionColor={colors.yellow}
        style={[styles.input, !editable && { color: colors.muted }]}
        {...props}
      />
      {password && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} style={styles.passwordToggle}>
        <Text style={styles.link}>{visible ? 'Hide' : 'Show'}</Text>
      </Pressable>}
    </View>
  </View>;
}

export function Card({ children, admin = false }) { return <View style={[styles.card, admin && styles.adminCard]}>{children}</View>; }
export function Heading({ children }) { return <Text style={styles.heading}>{children}</Text>; }
export function Title({ children }) { return <Text style={styles.title}>{children}</Text>; }
export function Eyebrow({ children }) { return <Text style={styles.eyebrow}>{children}</Text>; }
export function Muted({ children }) { return <Text style={styles.muted}>{children}</Text>; }
export function ErrorText({ children }) { return children ? <Text accessibilityRole="alert" style={styles.error}>{children}</Text> : null; }
export function Row({ children }) { return <View style={styles.row}>{children}</View>; }

export function ScanCorners() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View style={[styles.scanCorner, styles.scanTopLeft]} />
    <View style={[styles.scanCorner, styles.scanTopRight]} />
    <View style={[styles.scanCorner, styles.scanBottomLeft]} />
    <View style={[styles.scanCorner, styles.scanBottomRight]} />
  </View>;
}

export function ModalFrame({ title, onClose, children, busy = false }) {
  return <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
    <SafeAreaView testID="app-modal" accessibilityViewIsModal style={styles.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
        <View style={styles.modalCard}>
          <View style={styles.modalGrip} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <Title>{title}</Title>
            {children}
            <LinkButton disabled={busy} onPress={onClose}>Close</LinkButton>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { width: '100%', maxWidth: 650, alignSelf: 'center', flex: 1, backgroundColor: colors.background },
  header: { minHeight: 62, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#0B0D0D', borderBottomWidth: 1, borderBottomColor: '#242727', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeading: { flexDirection: 'row', alignItems: 'center', minWidth: 0, flex: 1, gap: 10 },
  headerBack: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { color: colors.ink, fontFamily: displayFont, fontSize: 20, fontWeight: '800' },
  brand: { fontWeight: '900', fontSize: 19, color: colors.yellow },
  badge: { color: colors.yellow, backgroundColor: '#23230E', borderWidth: 1, borderColor: '#55521B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, fontSize: 10, letterSpacing: 0.8, fontWeight: '800' },
  scroll: { padding: 18, paddingBottom: 32, gap: 14 },
  card: { padding: 18, borderRadius: 17, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, gap: 12 },
  adminCard: { borderTopWidth: 3, borderTopColor: colors.yellow },
  heroFrame: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  hero: { minHeight: 264, padding: 24, justifyContent: 'space-between', overflow: 'hidden' },
  heroGridOne: { position: 'absolute', width: 220, height: 220, borderWidth: 1, borderColor: '#FFFFFF0A', transform: [{ rotate: '45deg' }], right: -80, top: -70 },
  heroGridTwo: { position: 'absolute', width: 150, height: 150, borderWidth: 1, borderColor: '#FFFFFF0A', transform: [{ rotate: '45deg' }], right: -45, top: -35 },
  heroSlash: { position: 'absolute', width: 28, height: 170, backgroundColor: colors.yellow, opacity: 0.95, transform: [{ rotate: '42deg' }], right: 18, top: -36 },
  brandCrop: { width: 236, height: 52, overflow: 'hidden', justifyContent: 'center' },
  brandCropCompact: { width: 172, height: 38 },
  brandImage: { width: 236, height: 79 },
  brandImageCompact: { width: 172, height: 57 },
  heroTitle: { color: colors.ink, fontFamily: displayFont, fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -0.8 },
  heroAccent: { color: colors.yellow },
  heading: { color: colors.ink, fontFamily: displayFont, fontSize: 30, lineHeight: 34, fontWeight: '900', marginBottom: 2 },
  title: { color: colors.ink, fontFamily: displayFont, fontSize: 21, lineHeight: 25, fontWeight: '800', marginBottom: 2 },
  eyebrow: { color: colors.yellow, fontSize: 10, lineHeight: 14, letterSpacing: 2, fontWeight: '800', textTransform: 'uppercase' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.paper, fontSize: 12, letterSpacing: 0.5, fontWeight: '700', marginBottom: 7 },
  field: { marginBottom: 10 },
  inputRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#464A48', borderRadius: 13, backgroundColor: '#151717' },
  inputDisabled: { backgroundColor: '#101212' },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 15, paddingVertical: 14, fontSize: 16, color: colors.ink },
  passwordToggle: { padding: 14 },
  button: { borderRadius: 13, alignItems: 'stretch', justifyContent: 'center', minHeight: 54, marginVertical: 2, overflow: 'hidden' },
  buttonFill: { minHeight: 54, paddingHorizontal: 18, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.yellow },
  buttonSecondary: { paddingHorizontal: 18, backgroundColor: '#101212', borderWidth: 1, borderColor: '#6B706D' },
  buttonDanger: { paddingHorizontal: 18, backgroundColor: '#261212', borderWidth: 1, borderColor: '#74332F' },
  buttonMuted: { opacity: 0.55 },
  buttonText: { color: '#080909', fontFamily: displayFont, fontSize: 17, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  buttonTextSecondary: { color: colors.ink },
  buttonTextDanger: { color: '#FF9B94' },
  linkHit: { paddingVertical: 9, alignSelf: 'flex-start' },
  link: { color: colors.yellow, fontWeight: '800', fontSize: 14 },
  error: { color: '#FF8A82', backgroundColor: '#281413', borderRadius: 10, padding: 11, fontSize: 14, lineHeight: 20, marginVertical: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 10 },
  metric: { flexGrow: 1, flexBasis: '40%', minWidth: 120, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 15 },
  metricValue: { fontFamily: displayFont, fontSize: 30, lineHeight: 33, fontWeight: '900', color: colors.yellow },
  nav: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#0B0D0D', borderTopWidth: 1, borderTopColor: '#292C2B', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10 },
  navItem: { minWidth: 78, padding: 6, alignItems: 'center', gap: 3 },
  navText: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  navTextActive: { color: colors.yellow },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', justifyContent: 'flex-end', padding: 12 },
  modalKeyboard: { width: '100%', maxWidth: 500, maxHeight: '92%', alignSelf: 'center', justifyContent: 'flex-end' },
  modalCard: { maxHeight: '100%', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, borderRadius: 24, overflow: 'hidden' },
  modalGrip: { width: 48, height: 4, borderRadius: 2, backgroundColor: '#606461', alignSelf: 'center', marginTop: 10 },
  modalContent: { padding: 22, gap: 10 },
  qr: { alignItems: 'center', padding: 20, backgroundColor: colors.paper, borderRadius: 15, gap: 12 },
  qrText: { color: '#111', fontWeight: '700' },
  notice: { paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#2A2508', borderBottomWidth: 1, borderBottomColor: '#6A5D0A' },
  noticeText: { color: '#FFF4B4', fontWeight: '700' },
  separator: { height: 1, backgroundColor: colors.line, marginVertical: 8 },
  screenLead: { paddingVertical: 5, gap: 4 },
  greeting: { color: colors.ink, fontFamily: displayFont, fontSize: 20, fontWeight: '700' },
  greetingName: { color: colors.yellow, fontFamily: displayFont, fontSize: 35, lineHeight: 39, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
  localPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#4A4D4B', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  localPillText: { color: colors.paper, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#292C2B' },
  dataLabel: { color: colors.muted, minWidth: 65 },
  dataValue: { color: colors.ink, flex: 1, fontWeight: '700', textAlign: 'right' },
  eventRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 15 },
  eventIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#24230F' },
  eventText: { flex: 1, gap: 3 },
  eventLabel: { color: colors.muted, fontSize: 12 },
  eventName: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  activityText: { flex: 1, gap: 2 },
  activityName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  activityTime: { color: colors.muted, fontSize: 12 },
  activityStatus: { color: colors.yellow, fontSize: 11, fontWeight: '700' },
  attendanceQrCard: { alignItems: 'center', gap: 12, padding: 20, borderRadius: 17, backgroundColor: colors.paper },
  attendanceQrTitle: { color: colors.black, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  summaryTile: { flex: 1, minWidth: 120, minHeight: 126, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 15, gap: 6 },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  summaryValue: { color: colors.yellow, fontFamily: displayFont, fontSize: 34, fontWeight: '900' },
  summaryDetail: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.panelRaised, borderRadius: 12 },
  rosterHeader: { flexDirection: 'row', gap: 8, padding: 9, backgroundColor: '#242727', borderRadius: 8 },
  rosterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  rosterId: { flex: 1, color: colors.ink, fontSize: 12 },
  rosterName: { flex: 1.5, color: colors.ink, fontSize: 12 },
  rosterStatus: { flex: 0.8, color: colors.yellow, fontSize: 12 },
  scanFrame: { height: 320, overflow: 'hidden', borderRadius: 14, backgroundColor: '#1C1F1E' },
  scanCorner: { position: 'absolute', width: 36, height: 36, borderColor: colors.yellow },
  scanTopLeft: { top: 24, left: 24, borderTopWidth: 4, borderLeftWidth: 4 },
  scanTopRight: { top: 24, right: 24, borderTopWidth: 4, borderRightWidth: 4 },
  scanBottomLeft: { bottom: 24, left: 24, borderBottomWidth: 4, borderLeftWidth: 4 },
  scanBottomRight: { bottom: 24, right: 24, borderBottomWidth: 4, borderRightWidth: 4 },
  receiptPreview: { alignItems: 'center', justifyContent: 'center', minHeight: 230, backgroundColor: '#1C1F1E', borderRadius: 14 },
  receiptQr: { padding: 15, backgroundColor: colors.paper, borderRadius: 9, alignItems: 'center', gap: 8 },
  successBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.yellow, borderRadius: 12, minHeight: 60, padding: 10 },
  successText: { color: colors.black, fontFamily: displayFont, fontSize: 20, fontWeight: '900' },
});
