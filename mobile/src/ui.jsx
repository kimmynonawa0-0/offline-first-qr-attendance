import { useState } from 'react';
import { ImageBackground, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GREEN_GRADIENT, UNIVERSITY_NAME, UNIVERSITY_PHOTO } from './branding';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = { green: '#14734c', dark: '#06452f', light: '#dff2e5', purple: '#116342', ink: '#142e25', muted: '#5a7468', background: '#f1f6ee', red: '#b91c1c' };

export function UniversityBanner() {
  const content = <LinearGradient colors={UNIVERSITY_PHOTO ? ['#052e2080', '#052e20ed'] : GREEN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
    <View style={styles.heroRing} />
    <Text style={styles.heroEyebrow}>{UNIVERSITY_NAME.toUpperCase()}</Text>
    <Text style={styles.heroTitle}>Every presence{ '\n' }counts.</Text>
    <Text style={styles.heroCaption}>Your campus. Your community.</Text>
  </LinearGradient>;
  return <View style={styles.heroFrame}>{UNIVERSITY_PHOTO ? <ImageBackground source={UNIVERSITY_PHOTO} resizeMode="cover">{content}</ImageBackground> : content}</View>;
}

export function Button({ children, onPress, secondary = false, purple = false, danger = false, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: danger ? colors.red : secondary ? '#e2e8f0' : purple ? colors.purple : colors.green }, (pressed || disabled) && { opacity: 0.6 }]}>
    <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>{children}</Text>
  </Pressable>;
}

export function LinkButton({ children, onPress, disabled }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.linkHit}>
    <Text style={styles.link}>{children}</Text>
  </Pressable>;
}

export function Field({ label, value, onChangeText, password = false, email = false, editable = true, placeholder, ...props }) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={editable}
        placeholder={placeholder} placeholderTextColor={colors.muted} autoCapitalize={email || password ? 'none' : 'sentences'}
        autoCorrect={!email && !password} keyboardType={email ? 'email-address' : 'default'}
        secureTextEntry={password && !visible} style={[styles.input, !editable && { color: colors.muted }]} {...props} />
      {password && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} style={styles.passwordToggle}>
        <Text style={styles.link}>{visible ? 'Hide' : 'Show'}</Text>
      </Pressable>}
    </View>
  </View>;
}

export function Card({ children, admin = false }) { return <View style={[styles.card, admin && styles.adminCard]}>{children}</View>; }
export function Heading({ children }) { return <Text style={styles.heading}>{children}</Text>; }
export function Title({ children }) { return <Text style={styles.title}>{children}</Text>; }
export function Muted({ children }) { return <Text style={styles.muted}>{children}</Text>; }
export function ErrorText({ children }) { return children ? <Text accessibilityRole="alert" style={styles.error}>{children}</Text> : null; }
export function Row({ children }) { return <View style={styles.row}>{children}</View>; }

export function ModalFrame({ title, onClose, children, busy = false }) {
  return <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
    <SafeAreaView testID="app-modal" accessibilityViewIsModal style={styles.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
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
  container: { width: '100%', maxWidth: 650, alignSelf: 'center', flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontWeight: '800', fontSize: 19, color: colors.green },
  badge: { color: colors.dark, backgroundColor: colors.light, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, fontSize: 12, fontWeight: '600' },
  scroll: { padding: 20, paddingBottom: 30, gap: 16 },
  card: { padding: 22, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dcfce7', gap: 14 },
  adminCard: { borderTopWidth: 4, borderTopColor: colors.purple },
  heroFrame: { borderRadius: 24, overflow: 'hidden' },
  hero: { padding: 26, minHeight: 190, justifyContent: 'flex-end', overflow: 'hidden' },
  heroRing: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 35, borderColor: '#ffffff10', right: -70, top: -60 },
  heroEyebrow: { color: '#c7e8d4', fontSize: 10, letterSpacing: 2.5, fontWeight: '700', marginBottom: 20 },
  heroTitle: { color: '#fff', fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  heroCaption: { color: '#d5efdc', fontSize: 13, marginTop: 12 },
  heading: { color: colors.dark, fontSize: 25, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  field: { marginBottom: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 14, backgroundColor: '#f8fafc' },
  input: { flex: 1, minWidth: 0, padding: 15, fontSize: 16, color: colors.ink },
  passwordToggle: { padding: 12 },
  button: { padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50, marginVertical: 4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  linkHit: { paddingVertical: 10, alignSelf: 'flex-start' },
  link: { color: colors.green, fontWeight: '700', fontSize: 14 },
  error: { color: colors.red, fontSize: 14, lineHeight: 21, marginVertical: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  metric: { flexGrow: 1, flexBasis: '40%', backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, alignItems: 'center' },
  metricValue: { fontSize: 25, fontWeight: '800', color: colors.green },
  nav: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12 },
  navItem: { padding: 10, alignItems: 'center', gap: 4 },
  navText: { color: colors.green, fontWeight: '700', fontSize: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(5,20,10,0.8)', justifyContent: 'center', padding: 16 },
  modalKeyboard: { flex: 1, justifyContent: 'center', width: '100%', maxWidth: 440, alignSelf: 'center' },
  modalCard: { maxHeight: '100%', backgroundColor: '#fff', borderRadius: 24, overflow: 'hidden' },
  qr: { alignItems: 'center', padding: 18, backgroundColor: '#fff', borderRadius: 14, gap: 12 },
  notice: { padding: 14, backgroundColor: colors.light, borderBottomWidth: 1, borderBottomColor: '#bbf7d0' },
  separator: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 },
});
