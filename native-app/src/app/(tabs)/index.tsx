import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card, Screen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';

export default function Home() {
  const { session } = useAuth();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('user_profiles')
      .select('username')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setUsername(data?.username ?? null));
  }, [session]);

  return (
    <Screen title={username ? `Hey, ${username}` : 'Home'}>
      <Card>
        <Text style={styles.label}>Scaffold</Text>
        <Text style={styles.body}>
          This screen reads your profile from the same Supabase project as the website. The mobile
          home redesign (src/apps/mobile-home/MobileHome.tsx on the web) gets rebuilt here next.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.violetBright, fontWeight: '600' },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
