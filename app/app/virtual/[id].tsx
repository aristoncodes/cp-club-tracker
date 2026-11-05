import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatClock } from 'shared/duel';
import type { VirtualCell } from 'shared/virtual';
import { api, type Me } from '../../lib/api';
import { Button, common, ScreenHeader } from '../../lib/ui';
import { theme } from '../../theme';

type Standings = {
  name: string;
  url: string;
  startAt: number;
  endAt: number;
  now: number;
  problems: { index: string; name: string }[];
  rows: { userId: number; name: string; username: string | null; cells: Record<string, VirtualCell>; solved: number; penalty: number; rank: number }[];
};

const REFRESH_MS = 30_000;

function Cell({ cell }: { cell?: VirtualCell }) {
  if (cell?.solvedAt !== undefined) return <View style={[styles.cell, { backgroundColor: theme.lime }]}><Text style={styles.cellText}>{cell.wrong ? `+${cell.wrong}` : '+'}</Text></View>;
  if (cell?.wrong) return <View style={[styles.cell, { backgroundColor: theme.pinkTint }]}><Text style={[styles.cellText, { color: theme.pinkText }]}>−{cell.wrong}</Text></View>;
  return <View style={[styles.cell, { backgroundColor: theme.card2 }]} />;
}

export default function VirtualStandings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Standings | null>(null);
  const [myId, setMyId] = useState(0);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      const load = () => api<Standings>(`/virtuals/${id}/standings`).then(setData).catch((err) => setError(err.message));
      load();
      api<Me>('/me').then((me) => setMyId(me.user.id)).catch(console.warn);
      const timer = setInterval(load, REFRESH_MS);
      return () => clearInterval(timer);
    }, [id]),
  );

  const live = !!data && data.now >= data.startAt && data.now < data.endAt;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader title="Standings" />
      {error ? <Text style={common.error}>{error}</Text> : null}
      {data ? (
        <>
          <View style={styles.header}>
            <View style={common.row}>
              <Text style={styles.tag}>CLUB VIRTUAL</Text>
              {live ? <Text style={styles.live}>LIVE</Text> : null}
            </View>
            <Text style={styles.name}>{data.name}</Text>
            <Text style={styles.note}>{data.rows.length} {data.rows.length === 1 ? 'member' : 'members'} in</Text>
            {live ? <Text style={styles.clock}>{formatClock(data.endAt - data.now)}</Text> : null}
            <Button title="Open on Codeforces" onPress={() => Linking.openURL(data.url)} />
          </View>
          {data.rows.length === 0 ? <Text style={common.muted}>Nobody yet. Start the virtual on Codeforces within 15 minutes of the club start.</Text> : null}
          <ScrollView horizontal>
            <View style={styles.table}>
              {data.rows.map((row) => (
                <View key={row.userId} style={[styles.row, row.userId === myId && styles.mine]}>
                  <Text style={styles.rank}>{row.rank}</Text>
                  <Text style={styles.who} numberOfLines={1}>@{row.username ?? row.name}</Text>
                  {data.problems.map((problem) => <Cell key={problem.index} cell={row.cells[problem.index]} />)}
                  <Text style={styles.solved}>{row.solved}</Text>
                  <Text style={styles.penalty}>{row.penalty}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 48, gap: 12 },
  header: { gap: 8, padding: 18, borderRadius: 22, backgroundColor: theme.violet },
  tag: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.white, color: theme.violetText, fontFamily: theme.font.bold, fontSize: 11 },
  live: { color: theme.lime, fontFamily: theme.font.bold, fontSize: 11 },
  name: { color: theme.white, fontFamily: theme.font.display, fontSize: 22 },
  note: { color: theme.violetPale, fontFamily: theme.font.regular, fontSize: 13 },
  clock: { color: theme.white, fontFamily: theme.font.monoHeavy, fontSize: 36 },
  table: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, padding: 4, borderRadius: 12 },
  mine: { backgroundColor: theme.limeTint },
  rank: { width: 24, color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 13 },
  who: { width: 100, color: theme.text, fontFamily: theme.font.monoBold, fontSize: 12 },
  cell: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  cellText: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 11 },
  solved: { width: 26, textAlign: 'center', color: theme.lime, fontFamily: theme.font.monoHeavy, fontSize: 13 },
  penalty: { width: 36, textAlign: 'center', color: theme.muted, fontFamily: theme.font.monoBold, fontSize: 12 },
});
