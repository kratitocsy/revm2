import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Screen } from '../../components/Screen';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';

type Row = { rank: number; username: string; hours: number | null; coins: number | null; is_me: boolean };

// Same RPC and range the web tracker's global leaderboard uses (tracker.html).
export default function Leaderboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('leaderboard_global', { p_range: '30d', p_limit: 20 }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
    });
  }, []);

  return (
    <Screen title="Leaderboard">
      {error && <Text style={styles.error}>{error}</Text>}
      {rows?.length === 0 && <Text style={styles.muted}>No study activity yet in this range.</Text>}
      {rows && rows.length > 0 && (
        <Card>
          {rows.map((r) => (
            <View key={r.rank} style={[styles.row, r.is_me && styles.me]}>
              <Text style={styles.rank}>{r.rank}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {r.username}
              </Text>
              <Text style={styles.hours}>{(r.hours ?? 0).toFixed(1)}h</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderRadius: 8 },
  me: { backgroundColor: colors.violetDim },
  rank: { color: colors.muted, width: 28, textAlign: 'right', fontWeight: '600' },
  name: { color: colors.white, flex: 1, fontSize: 15 },
  hours: { color: colors.violetBright, fontWeight: '600' },
  muted: { color: colors.muted },
  error: { color: colors.danger },
});
