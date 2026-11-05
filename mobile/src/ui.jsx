import { useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export const colors = {
  // Brand primitives.
  yellow: '#FFD21A',
  yellowBright: '#FFE22E',
  yellowDeep: '#E4AE00',
  yellowWarm: '#F5BD00',
  black: '#070909',
  onAccent: '#080909',
  paper: '#F4F1E8',

  // Surfaces.
  background: '#070909',
  surface: '#0B0D0D',
  panel: '#111313',
  panelRaised: '#181A1A',
  inputSurface: '#151717',
  inputDisabled: '#101212',
  accentSurface: '#24230F',
  scanSurface: '#1C1F1E',

  // Text.
  ink: '#F7F7F2',
  muted: '#A9ACA8',
  placeholder: '#717572',
  qrInk: '#111',

  // Borders and dividers.
  line: '#343737',
  lineSoft: '#242727',
  lineSubtle: '#292C2B',
  inputBorder: '#464A48',
  controlBorder: '#6B706D',
  controlBorderMuted: '#4A4D4B',

  // Status.
  dangerSurface: '#261212',
  dangerSurfaceAlt: '#281413',
  dangerBorder: '#74332F',
  dangerText: '#FF9B94',
  dangerTextSoft: '#FF8A82',
  warningSurface: '#2A2508',
  warningBorder: '#6A5D0A',
  warningText: '#FFF4B4',
  badgeSurface: '#23230E',
  badgeBorder: '#55521B',

  // Decorative.
  heroTop: '#151817',
  heroMid: '#090B0B',
  heroBottom: '#050606',
  heroGrid: '#FFFFFF0A',
  grip: '#606461',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const type = {
  eyebrow: 10,
  caption: 12,
  body: 15,
  title: 18,
  heading: 26,
  display: 34,
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
    <LinearGradient colors={[colors.heroTop, colors.heroMid, colors.heroBottom]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
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
  const iconColor = primary ? colors.black : danger ? colors.dangerText : colors.ink;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={typeof children === 'string' ? children : undefined}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    android_ripple={{ color: primary ? 'rgba(0,0,0,0.12)' : 'rgba(255,210,26,0.16)', borderless: false }}
    style={({ pressed, hovered }) => [
      styles.button,
      secondary && styles.buttonSecondary,
      danger && styles.buttonDanger,
      purple && styles.buttonPrimary,
      hovered && !disabled && styles.buttonHover,
      pressed && !disabled && styles.buttonPressed,
      disabled && styles.buttonDisabled,
    ]}
  >
    {primary
      ? <LinearGradient colors={[colors.yellowBright, colors.yellow, colors.yellowWarm]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonFill}>
        {icon && <Ionicons testID="button-icon" name={icon} size={23} color={iconColor} />}
        <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{children}</Text>
      </LinearGradient>
      : <View style={styles.buttonFill}>
        {icon && <Ionicons testID="button-icon" name={icon} size={23} color={iconColor} />}
        <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, danger && styles.buttonTextDanger]}>{children}</Text>
      </View>}
  </Pressable>;
}

export function SegmentedControl({ options, value, onChange, disabled = false }) {
  return <View style={styles.segment}>
    {options.map(option => {
      const selected = option.value === value;
      return <Pressable
        key={option.value}
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => [
          styles.segmentItem,
          selected && styles.segmentItemActive,
          pressed && !selected && !disabled && styles.segmentItemPressed,
          disabled && styles.buttonDisabled,
        ]}
      >
        <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

export function LinkButton({ children, onPress, disabled }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.linkHit, pressed && !disabled && styles.linkPressed, disabled && styles.buttonDisabled]}>
    <Text style={styles.link}>{children}</Text>
  </Pressable>;
}

export function Field({ label, value, onChangeText, password = false, newPassword = false, email = false, username = false, editable = true, placeholder, ...props }) {
  const [visible, setVisible] = useState(false);
  const identity = password || email || username;
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputRow, !editable && styles.inputDisabled]}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoCapitalize={identity ? 'none' : 'sentences'}
        autoCorrect={!identity}
        keyboardType={email ? 'email-address' : 'default'}
        autoComplete={password ? (newPassword ? 'new-password' : 'current-password') : email ? 'email' : username ? 'username' : 'off'}
        textContentType={password ? (newPassword ? 'newPassword' : 'password') : email ? 'emailAddress' : username ? 'username' : 'none'}
        returnKeyType="next"
        enterKeyHint="next"
        secureTextEntry={password && !visible}
        selectionColor={colors.yellow}
        style={[styles.input, !editable && { color: colors.muted }]}
        {...props}
      />
      {password && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} hitSlop={4} onPress={() => setVisible(!visible)} style={styles.passwordToggle}>
        <Text style={styles.link}>{visible ? 'Hide' : 'Show'}</Text>
      </Pressable>}
    </View>
  </View>;
}

function Skeleton({ style }) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.skeleton, animatedStyle, style]} />;
}

export function LoadingScreen() {
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading saved data" style={styles.loadingSkeleton}>
    <BrandMark />
    <View style={styles.skeletonCard}>
      <Skeleton style={styles.skeletonTitle} />
      <Skeleton style={styles.skeletonLine} />
      <Skeleton style={styles.skeletonLineShort} />
    </View>
    <View style={styles.skeletonCard}>
      <Skeleton style={styles.skeletonTitleShort} />
      <Skeleton style={styles.skeletonLine} />
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

export function ModalFrame({ title, onClose, children, busy = false, dismissOnBackdrop = false, showClose = true }) {
  const [dragY] = useState(() => new RNAnimated.Value(0));
  const closeState = useRef({ busy, onClose });
  useEffect(() => { closeState.current = { busy, onClose }; }, [busy, onClose]);
  const close = () => { if (!closeState.current.busy) closeState.current.onClose(); };
  const dismiss = () => { if (!busy) onClose(); };
  useEffect(() => {
    dragY.setValue(28);
    RNAnimated.timing(dragY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [dragY]);
  function settleDrag() {
    RNAnimated.spring(dragY, { toValue: 0, damping: 20, stiffness: 220, useNativeDriver: true }).start();
  }
  function onDragMove(_, gesture) { dragY.setValue(Math.max(0, gesture.dy)); }
  function onDragRelease(_, gesture) {
    if (closeState.current.busy) { settleDrag(); return; }
    if (gesture.dy > 96 || gesture.vy > 0.9) {
      RNAnimated.timing(dragY, { toValue: 600, duration: 160, useNativeDriver: true }).start(close);
    } else {
      settleDrag();
    }
  }
  function onDragTerminate() { settleDrag(); }
  return <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
    <SafeAreaView testID="app-modal" accessibilityViewIsModal style={styles.overlay}>
      {dismissOnBackdrop && <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
        onPress={dismiss}
        style={StyleSheet.absoluteFill}
      />}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
        <RNAnimated.View style={[styles.modalCard, { transform: [{ translateY: dragY }] }]}>
          <View
            accessibilityRole="button"
            accessibilityLabel={busy ? undefined : 'Swipe down to close'}
            accessibilityState={{ disabled: busy }}
            onStartShouldSetResponder={() => !busy}
            onMoveShouldSetResponder={(_, gesture) => !busy
              && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx)}
            onResponderMove={onDragMove}
            onResponderRelease={onDragRelease}
            onResponderTerminate={onDragTerminate}
            style={styles.modalGripHitArea}
          >
            <View style={styles.modalGrip} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <Title>{title}</Title>
            {children}
            {showClose && <LinkButton disabled={busy} onPress={onClose}>Close</LinkButton>}
          </ScrollView>
        </RNAnimated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { width: '100%', maxWidth: 650, alignSelf: 'center', flex: 1, backgroundColor: colors.background },
  header: { minHeight: 62, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeading: { flexDirection: 'row', alignItems: 'center', minWidth: 0, flex: 1, gap: 10 },
  headerBack: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { color: colors.ink, fontSize: type.title, lineHeight: 23, fontWeight: '700' },
  brand: { fontWeight: '900', fontSize: 19, color: colors.yellow },
  badge: { color: colors.yellow, backgroundColor: colors.badgeSurface, borderWidth: 1, borderColor: colors.badgeBorder, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, fontSize: type.eyebrow, letterSpacing: 0.8, fontWeight: '800' },
  scroll: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  card: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, gap: 10 },
  adminCard: { borderTopWidth: 3, borderTopColor: colors.yellow },
  heroFrame: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  hero: { minHeight: 240, padding: space.xl, justifyContent: 'space-between', overflow: 'hidden' },
  heroGridOne: { position: 'absolute', width: 220, height: 220, borderWidth: 1, borderColor: colors.heroGrid, transform: [{ rotate: '45deg' }], right: -80, top: -70 },
  heroGridTwo: { position: 'absolute', width: 150, height: 150, borderWidth: 1, borderColor: colors.heroGrid, transform: [{ rotate: '45deg' }], right: -45, top: -35 },
  heroSlash: { position: 'absolute', width: 28, height: 170, backgroundColor: colors.yellow, opacity: 0.95, transform: [{ rotate: '42deg' }], right: 18, top: -36 },
  brandCrop: { width: 236, height: 52, overflow: 'hidden', justifyContent: 'center' },
  brandCropCompact: { width: 172, height: 38 },
  brandImage: { width: 236, height: 79 },
  brandImageCompact: { width: 172, height: 57 },
  heroTitle: { color: colors.ink, fontFamily: displayFont, fontSize: type.display, lineHeight: 38, fontWeight: '900', letterSpacing: -0.6 },
  heroAccent: { color: colors.yellow },
  heading: { color: colors.ink, fontFamily: displayFont, fontSize: type.heading, lineHeight: 30, fontWeight: '800', marginBottom: 2 },
  title: { color: colors.ink, fontSize: type.title, lineHeight: 23, fontWeight: '700', marginBottom: 2 },
  eyebrow: { color: colors.yellow, fontSize: type.eyebrow, lineHeight: 14, letterSpacing: 1.6, fontWeight: '800', textTransform: 'uppercase' },
  muted: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
  label: { color: colors.paper, fontSize: type.caption, letterSpacing: 0.4, fontWeight: '700', marginBottom: 6 },
  field: { marginBottom: 10 },
  inputRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.md, backgroundColor: colors.inputSurface },
  inputDisabled: { backgroundColor: colors.inputDisabled },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.ink },
  passwordToggle: { padding: 14 },
  button: { borderRadius: radius.md, alignItems: 'stretch', justifyContent: 'center', minHeight: 50, marginVertical: 2, overflow: 'hidden' },
  buttonFill: { minHeight: 50, paddingHorizontal: space.lg, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.yellow },
  buttonSecondary: { paddingHorizontal: space.lg, backgroundColor: colors.inputDisabled, borderWidth: 1, borderColor: colors.controlBorder },
  buttonDanger: { paddingHorizontal: space.lg, backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.dangerBorder },
  buttonMuted: { opacity: 0.55 },
  buttonHover: { opacity: 0.92 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.45 },
  iconPressed: { backgroundColor: colors.lineSubtle, opacity: 0.9 },
  linkPressed: { opacity: 0.7 },
  segment: { flexDirection: 'row', padding: 4, gap: 4, backgroundColor: colors.inputDisabled, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentItemActive: { backgroundColor: colors.yellow },
  segmentItemPressed: { backgroundColor: colors.lineSubtle },
  segmentText: { color: colors.muted, fontSize: type.body, fontWeight: '700' },
  segmentTextActive: { color: colors.onAccent, fontWeight: '800' },
  buttonText: { color: colors.onAccent, fontSize: type.body, fontWeight: '700', textAlign: 'center' },
  buttonTextPrimary: { fontFamily: displayFont, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  buttonTextSecondary: { color: colors.ink },
  buttonTextDanger: { color: colors.dangerText },
  linkHit: { paddingVertical: 9, alignSelf: 'flex-start' },
  link: { color: colors.yellow, fontWeight: '800', fontSize: 14 },
  error: { color: colors.dangerTextSoft, backgroundColor: colors.dangerSurfaceAlt, borderRadius: 10, padding: 11, fontSize: 14, lineHeight: 20, marginVertical: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 10 },
  metric: { flexGrow: 1, flexBasis: '40%', minWidth: 120, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14 },
  metricValue: { fontFamily: displayFont, fontSize: 32, lineHeight: 35, fontWeight: '900', color: colors.yellow },
  nav: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.lineSubtle, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10 },
  navItem: { minWidth: 72, minHeight: 48, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.md },
  navItemActive: { backgroundColor: colors.accentSurface },
  navItemPressed: { backgroundColor: colors.lineSubtle },
  navText: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  navTextActive: { color: colors.yellow },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', justifyContent: 'flex-end', padding: 12 },
  modalKeyboard: { width: '100%', maxWidth: 500, maxHeight: '92%', alignSelf: 'center', justifyContent: 'flex-end' },
  modalCard: { maxHeight: '100%', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, overflow: 'hidden' },
  modalGripHitArea: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  modalGrip: { width: 48, height: 4, borderRadius: 2, backgroundColor: colors.grip, alignSelf: 'center', marginTop: 10 },
  modalContent: { padding: 20, gap: 10 },
  qr: { alignItems: 'center', padding: 20, backgroundColor: colors.paper, borderRadius: 15, gap: 12 },
  qrText: { color: colors.qrInk, fontWeight: '700' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: 18, paddingRight: space.sm, paddingVertical: 10, backgroundColor: colors.warningSurface, borderBottomWidth: 1, borderBottomColor: colors.warningBorder },
  noticeText: { flex: 1, color: colors.warningText, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  noticeClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  separator: { height: 1, backgroundColor: colors.line, marginVertical: 8 },
  screenLead: { paddingVertical: 5, gap: 4 },
  greeting: { color: colors.muted, fontSize: type.body, lineHeight: 20, fontWeight: '500' },
  greetingName: { color: colors.yellow, fontFamily: displayFont, fontSize: 32, lineHeight: 36, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
  localPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.controlBorderMuted, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  localPillText: { color: colors.paper, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSubtle },
  dataLabel: { color: colors.muted, minWidth: 65 },
  dataValue: { color: colors.ink, flex: 1, fontWeight: '700', textAlign: 'right' },
  eventSection: { marginTop: space.md, gap: space.sm },
  eventSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 2 },
  eventSectionTitle: { color: colors.ink, fontFamily: displayFont, fontSize: 18, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  eventSectionCount: { color: colors.muted, fontSize: type.caption, fontWeight: '800' },
  eventRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  eventIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.accentSurface },
  eventText: { flex: 1, gap: 3 },
  eventLabel: { color: colors.muted, fontSize: 12 },
  eventName: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  activityText: { flex: 1, gap: 2 },
  activityName: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  activityTime: { color: colors.muted, fontSize: type.caption },
  activityStatus: { color: colors.yellow, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  attendanceQrCard: { alignItems: 'center', gap: 12, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.paper },
  attendanceQrTitle: { color: colors.black, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  summaryTile: { flex: 1, minWidth: 120, minHeight: 120, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, gap: 6 },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  summaryValue: { color: colors.yellow, fontFamily: displayFont, fontSize: 32, fontWeight: '900' },
  summaryDetail: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.panelRaised, borderRadius: 12 },
  rosterHeader: { flexDirection: 'row', gap: 8, padding: 9, backgroundColor: colors.lineSoft, borderRadius: 8 },
  rosterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  rosterId: { flex: 1, color: colors.ink, fontSize: 12 },
  rosterName: { flex: 1.5, color: colors.ink, fontSize: 12 },
  rosterStatus: { flex: 0.8, color: colors.yellow, fontSize: 12 },
  scanFrame: { width: '100%', aspectRatio: 1, maxHeight: 420, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.scanSurface },
  scanCorner: { position: 'absolute', width: 36, height: 36, borderColor: colors.yellow },
  scanTopLeft: { top: 24, left: 24, borderTopWidth: 4, borderLeftWidth: 4 },
  scanTopRight: { top: 24, right: 24, borderTopWidth: 4, borderRightWidth: 4 },
  scanBottomLeft: { bottom: 24, left: 24, borderBottomWidth: 4, borderLeftWidth: 4 },
  scanBottomRight: { bottom: 24, right: 24, borderBottomWidth: 4, borderRightWidth: 4 },
  receiptPreview: { alignItems: 'center', justifyContent: 'center', minHeight: 230, backgroundColor: colors.scanSurface, borderRadius: 14 },
  receiptQr: { padding: 15, backgroundColor: colors.paper, borderRadius: 9, alignItems: 'center', gap: 8 },
  successBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.yellow, borderRadius: 12, minHeight: 60, padding: 10 },
  successText: { color: colors.black, fontFamily: displayFont, fontSize: 20, fontWeight: '900' },
  recordName: { color: colors.ink, fontWeight: '700' },
  recordStatus: { color: colors.yellow, fontWeight: '800' },
  attendee: { marginBottom: 10 },
  loadingWrap: { padding: 24 },
  loadingSkeleton: { gap: space.lg },
  skeletonCard: { padding: space.lg, gap: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  skeleton: { backgroundColor: colors.lineSubtle, borderRadius: radius.sm, minHeight: 12 },
  skeletonTitle: { width: '55%', height: 18 },
  skeletonTitleShort: { width: '40%', height: 18 },
  skeletonLine: { width: '90%', height: 13 },
  skeletonLineShort: { width: '70%', height: 13 },
  fill: { flex: 1 },
  fileText: { flex: 1 },
  resultText: { color: colors.yellow, fontWeight: '700' },
});
