import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { contestResult, type ContestOutcome } from 'shared/reasons';
import { formatIST } from 'shared/time';
import { api, type Contest } from '../../lib/api';
import { CellMark, common, ContestRow } from '../../lib/ui';
import { theme } from '../../theme';

type PastContest = ContestOutcome & { id: number; name: string; url: string; startAt: number };
type Virtual = Contest & { endAt: number; startedCount: number };
type ContestView = 'upcoming' | 'virtuals' | 'past';

const VIEWS: { id: ContestView; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'virtuals', label: 'Virtuals' },
  { id: 'past', label: 'Past' },
];

export default function Contests() {
  const [upcoming, setUpcoming] = useState<Contest[]>([]);
  const [past, setPast] = useState<PastContest[]>([]);
  const [virtuals, setVirtuals] = useState<Virtual[]>([]);
  const [view, setView] = useState<ContestView>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const [next, previous, clubVirtuals] = await Promise.all([api<Contest[]>('/contests/upcoming'), api<PastContest[]>('/contests/past'), api<Virtual[]>('/virtuals')]);
      setVirtuals(clubVirtuals);
      setUpcoming(next);
      setPast(previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load contests.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.lime} />}>
      <Text style={common.title}>Contests</Text>
      {error ? <Text style={common.error}>{error}</Text> : null}
      <View style={styles.tabs} accessibilityRole="tablist">
        {VIEWS.map((option) => (
          <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: view === option.id }} style={[styles.tab, view === option.id && styles.tabOn]} onPress={() => setView(option.id)}>
            <Text style={[styles.tabText, view === option.id && styles.tabTextOn]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      {view === 'upcoming' ? (
      <View style={common.card}>
        <Text style={common.heading}>Coming up</Text>
        {upcoming.length === 0 && !refreshing ? <Text style={common.muted}>No contests coming up yet. Check back soon.</Text> : null}
        {upcoming.map((contest) => <ContestRow key={contest.id} contest={contest} />)}
      </View>
      ) : null}
      {view === 'virtuals' ? (
        <View style={common.card}>
          <Text style={common.heading}>Club virtuals</Text>
          {virtuals.length === 0 && !refreshing ? <Text style={common.muted}>No club virtuals yet. Coordinators schedule them here.</Text> : null}
          {virtuals.map((item) => (
            <Pressable key={item.id} accessibilityRole="button" style={styles.row} onPress={() => router.push({ pathname: '/virtual/[id]', params: { id: String(item.id) } })}>
              <View style={styles.main}>
                <Text style={common.bold} numberOfLines={1}>{item.name}</Text>
                <Text style={common.small}>{formatIST(item.startAt)} · {item.goingCount} going · {item.startedCount} took part</Text>
              </View>
              {item.endAt > Date.now() / 1000 && item.startAt > Date.now() / 1000 && item.rsvp !== 'yes' ? (
                <Pressable accessibilityRole="button" style={styles.inButton} onPress={() => api(`/contests/${item.id}/rsvp`, 'POST', { going: true }).then(load).catch((err) => setError(err.message))}>
                  <Text style={styles.inText}>I'm in</Text>
                </Pressable>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {view === 'past' ? (
      <View style={common.card}>
        <Text style={common.heading}>Past contests</Text>
        {past.length === 0 && !refreshing ? <Text style={common.muted}>Your results show up here after your first contest.</Text> : null}
        {past.map((contest) => (
          <Pressable key={contest.id} style={styles.row} onPress={() => Linking.openURL(contest.url)}>
            <CellMark status={contest.status} reasonType={contest.reasonType} />
            <View style={styles.main}>
              <Text style={common.bold} numberOfLines={1}>{contest.name}</Text>
              <Text style={common.small}>{formatIST(contest.startAt).split(' · ')[0]} · {contestResult(contest)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 56, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  main: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  tabOn: { backgroundColor: theme.lime },
  tabText: { color: theme.muted, fontFamily: theme.font.bold, fontSize: 14 },
  tabTextOn: { color: theme.ink },
  inButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: theme.lime },
  inText: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 13 },
});
