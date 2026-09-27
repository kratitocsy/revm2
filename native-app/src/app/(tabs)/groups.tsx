import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card, Screen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';

type Group = { id: string; name: string };

export default function Groups() {
  const { session } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: memberships, error: e1 } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', session.user.id);
      if (e1) return setError(e1.message);
      const ids = (memberships ?? []).map((m) => m.group_id);
      if (ids.length === 0) return setGroups([]);
      const { data, error: e2 } = await supabase.from('study_groups').select('id,name').in('id', ids);
      if (e2) return setError(e2.message);
      setGroups(data ?? []);
    })();
  }, [session]);

  return (
    <Screen title="Groups">
      {error && <Text style={styles.error}>{error}</Text>}
      {groups?.length === 0 && <Text style={styles.muted}>You haven't joined a group yet.</Text>}
      {groups?.map((g) => (
        <Card key={g.id}>
          <Text style={styles.name}>{g.name}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.white, fontSize: 17, fontWeight: '600' },
  muted: { color: colors.muted },
  error: { color: colors.danger },
});
