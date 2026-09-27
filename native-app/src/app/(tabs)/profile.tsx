import { Pressable, StyleSheet, Text } from 'react-native';
import { Card, Screen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';

export default function Profile() {
  const { session } = useAuth();
  return (
    <Screen title="Profile">
      <Card>
        <Text style={styles.muted}>Signed in as</Text>
        <Text style={styles.email}>{session?.user.email}</Text>
      </Card>
      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted },
  email: { color: colors.white, fontSize: 17 },
  button: { borderColor: colors.danger, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonText: { color: colors.danger, fontWeight: '600' },
});
