import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { studyYearLabel } from 'shared/batch';
import { api, type Me } from '../../lib/api';
import { Rating } from '../../lib/ui';
import { theme } from '../../theme';

type Period = 'day' | 'week' | 'month';
type Row = {
  rank: number;
  userId: number;
  name: string;
  batchYear: number | null;
  cfHandle: string | null;
  cfRating: number | null;
  points: number;
  solves: number;
  hardest: number;
};

const TABS: { id: Period; label: string; empty: string }[] = [
  { id: 'day', label: 'Today', empty: 'No solves today yet. One problem gets you on the board.' },
  { id: 'week', label: 'This week', empty: 'No solves this week yet. One problem gets you on the board.' },
  { id: 'month', label: 'This month', empty: 'No solves this month yet. One problem gets you on the board.' },
];

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>('day');
  const [rows, setRows] = useState<Row[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const [data, me] = await Promise.all([api<Row[]>(`/leaderboard?period=${period}`), api<Me>('/me')]);
      setRows(data);
      setMyId(me.user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
    } finally {
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.page}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const active = tab.id === period;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setPeriod(tab.id)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => String(row.userId)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.accent} />}
        ListEmptyComponent={refreshing ? undefined : <Text style={styles.empty}>{TABS.find((t) => t.id === period)?.empty}</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.userId === myId && styles.myRow]}
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(item.userId) } })}
          >
            <Text style={[styles.rank, item.rank <= 3 && styles.topRank]}>{item.rank}</Text>
            <View style={styles.who}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name} <Text style={styles.muted}>{studyYearLabel(item.batchYear, Date.now() / 1000)}</Text>
              </Text>
              <Rating value={item.cfRating}>{item.cfHandle}</Rating>
            </View>
            <View style={styles.numbers}>
              <Text style={styles.points}>{item.points}</Text>
              <Text style={styles.muted}>
                {item.solves} · <Rating value={item.hardest} />
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 64, paddingHorizontal: 16, gap: 12 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: theme.surface2 },
  tabText: { color: theme.muted, fontFamily: theme.font.medium, fontSize: 14 },
  tabTextActive: { color: theme.accent },
  error: { color: theme.absent, fontFamily: theme.font.regular, fontSize: 14 },
  empty: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14, paddingVertical: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  myRow: { borderLeftColor: theme.accent },
  rank: { color: theme.muted, fontFamily: theme.font.mono, fontSize: 14, width: 28 },
  topRank: { color: theme.text },
  who: { flex: 1, gap: 2 },
  name: { color: theme.text, fontFamily: theme.font.medium, fontSize: 14 },
  numbers: { alignItems: 'flex-end', gap: 2 },
  points: { color: theme.accent, fontFamily: theme.font.mono, fontSize: 14 },
  muted: { color: theme.muted, fontFamily: theme.font.mono, fontSize: 14 },
});
