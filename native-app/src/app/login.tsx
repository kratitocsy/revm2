import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithGoogle, signInWithPassword } from '../lib/auth';
import { colors } from '../lib/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      const res = (await fn()) as { error?: { message: string } } | undefined;
      if (res?.error) Alert.alert('Sign-in failed', res.error.message);
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.brand}>Wynko</Text>
        <Text style={styles.sub}>Sign in to keep your streak going</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          style={[styles.button, busy && styles.disabled]}
          disabled={busy}
          onPress={() => run(() => signInWithPassword(email.trim(), password))}
        >
          <Text style={styles.buttonText}>Sign in</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondary, busy && styles.disabled]}
          disabled={busy}
          onPress={() => run(signInWithGoogle)}
        >
          <Text style={styles.buttonText}>Continue with Google</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  brand: { color: colors.white, fontSize: 40, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 16, marginBottom: 16 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.white,
    padding: 14,
    fontSize: 16,
  },
  button: { backgroundColor: colors.violet, borderRadius: 12, padding: 14, alignItems: 'center' },
  secondary: { backgroundColor: colors.violetDim, borderColor: colors.violet, borderWidth: 1 },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontWeight: '600', fontSize: 16 },
});
