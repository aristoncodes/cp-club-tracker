import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { solvesText } from 'shared/time';
import { api, type Me } from '../../lib/api';
import { Avatar, AvatarButton, common, initials, Rating } from '../../lib/ui';
import { theme } from '../../theme';

type Period = 'day' | 'week' | 'month';
type Row = {
  rank: number;
  moved: number | null;
  userId: number;
  name: string;
  points: number;
  solves: number;
  hardest: number;
};

const TABS: { id: Period; label: string; empty: string }[] = [
  { id: 'day', label: 'Today', empty: 'No solves today yet. One problem gets you on the board.' },
  { id: 'week', label: 'Week', empty: 'No solves this week yet. One problem gets you on the board.' },
  { id: 'month', label: 'Month', empty: 'No solves this month yet. One problem gets you on the board.' },
];
const PODIUM_ORDER = [
  { index: 1, color: theme.pink, height: 84 },
  { index: 0, color: theme.lime, height: 112 },
  { index: 2, color: theme.sun, height: 68 },
];

const openProfile = (userId: number) => router.push({ pathname: '/user/[id]', params: { id: String(userId) } });

function Podium({ rows }: { rows: Row[] }) {
  return (
    <View style={styles.podium}>
      {PODIUM_ORDER.map(({ index, color, height }) => {
        const row = rows[index];
        if (!row) return <View key={index} style={styles.podiumColumn} />;
        return (
          <Pressable key={row.userId} style={styles.podiumColumn} onPress={() => openProfile(row.userId)}>
            <View style={[styles.podiumAvatar, { borderColor: color }]}>
              <Text style={styles.podiumInitials}>{initials(row.name)}</Text>
            </View>
            <Text style={styles.podiumName} numberOfLines={1}>{row.name.split(' ')[0]}</Text>
            <View style={[styles.podiumBlock, { backgroundColor: color, height }]}>
              <Text style={styles.podiumRank}>{row.rank}</Text>
              <Text style={styles.podiumPoints}>{row.points}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const myId = me?.user.id ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const [data, meData] = await Promise.all([api<Row[]>(`/leaderboard?period=${period}`), api<Me>('/me')]);
      setRows(data);
      setMe(meData);
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

  const myIndex = rows.findIndex((row) => row.userId === myId);
  const mine = rows[myIndex];
  const above = rows[myIndex - 1];

  return (
    <View style={styles.page}>
      <View style={common.between}>
        <Text style={styles.title}>Leaderboard</Text>
        {me ? <AvatarButton userId={me.user.id} name={me.user.name} /> : null}
      </View>
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
        data={rows.slice(3)}
        keyExtractor={(row) => String(row.userId)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.lime} />}
        ListHeaderComponent={rows.length ? <Podium rows={rows} /> : undefined}
        ListEmptyComponent={refreshing || rows.length ? undefined : <Text style={styles.empty}>{TABS.find((t) => t.id === period)?.empty}</Text>}
        renderItem={({ item }) => {
          const isMe = item.userId === myId;
          return (
            <Pressable style={[styles.row, isMe && styles.myRow]} onPress={() => openProfile(item.userId)}>
              <View style={styles.rankBox}>
                <Text style={styles.rank}>{item.rank}</Text>
                {item.moved ? (
                  <Text style={[styles.moved, { color: item.moved > 0 ? theme.lime : theme.pink }]}>
                    {item.moved > 0 ? '▲' : '▼'}{Math.abs(item.moved)}
                  </Text>
                ) : null}
              </View>
              <Avatar userId={item.userId} name={item.name} />
              <View style={styles.who}>
                <Text style={styles.name} numberOfLines={1}>{isMe ? 'You' : item.name}</Text>
                <Text style={styles.detail}>{solvesText(item.solves)} · max <Rating value={item.hardest} /></Text>
              </View>
              <Text style={styles.points}>{item.points}</Text>
            </Pressable>
          );
        }}
      />
      {mine ? (
        <View style={styles.youBar}>
          <Text style={styles.youRank}>#{mine.rank}</Text>
          <View style={styles.who}>
            <Text style={styles.youTitle}>You · {mine.points} pts</Text>
            <Text style={styles.youDetail} numberOfLines={1}>
              {above ? `${Math.round((above.points - mine.points) * 10) / 10} pts to pass ${above.name.split(' ')[0]}` : "Nobody's ahead of you"}
            </Text>
          </View>
          {mine.moved ? <Text style={styles.youRank}>{mine.moved > 0 ? '▲' : '▼'}{Math.abs(mine.moved)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 56, paddingHorizontal: theme.gutter, gap: 12 },
  title: { color: theme.text, fontFamily: theme.font.display, fontSize: 30, letterSpacing: -0.9 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  tabActive: { backgroundColor: theme.lime },
  tabText: { color: theme.muted, fontFamily: theme.font.bold, fontSize: 14 },
  tabTextActive: { color: theme.ink },
  error: { color: theme.pink, fontFamily: theme.font.regular, fontSize: 14 },
  empty: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14, paddingVertical: 16 },
  list: { gap: 6, paddingBottom: 12 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  podiumColumn: { flex: 1, alignItems: 'center', gap: 6 },
  podiumAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.card },
  podiumInitials: { color: theme.text, fontFamily: theme.font.bold, fontSize: 16 },
  podiumName: { color: theme.text, fontFamily: theme.font.bold, fontSize: 13 },
  podiumBlock: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  podiumRank: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 22 },
  podiumPoints: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  myRow: { backgroundColor: theme.limeTint, borderColor: theme.limeLine },
  rankBox: { width: 30, alignItems: 'center' },
  rank: { color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 14 },
  moved: { fontFamily: theme.font.monoBold, fontSize: 10 },
  who: { flex: 1 },
  name: { color: theme.text, fontFamily: theme.font.bold, fontSize: 15 },
  detail: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 12 },
  points: { color: theme.lime, fontFamily: theme.font.monoHeavy, fontSize: 15 },
  youBar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8, borderRadius: 16, backgroundColor: theme.lime },
  youRank: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 16 },
  youTitle: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 15 },
  youDetail: { color: theme.ink, fontFamily: theme.font.medium, fontSize: 12 },
});
