import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { contestResult, type ContestOutcome } from 'shared/reasons';
import { formatIST } from 'shared/time';
import { api, type Contest } from '../../lib/api';
import { CellMark, common, ContestRow } from '../../lib/ui';
import { theme } from '../../theme';

type PastContest = ContestOutcome & { id: number; name: string; url: string; startAt: number };

export default function Contests() {
  const [upcoming, setUpcoming] = useState<Contest[]>([]);
  const [past, setPast] = useState<PastContest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const [next, previous] = await Promise.all([api<Contest[]>('/contests/upcoming'), api<PastContest[]>('/contests/past')]);
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
      <View style={common.card}>
        <Text style={common.heading}>Upcoming</Text>
        {upcoming.length === 0 && !refreshing ? <Text style={common.muted}>No upcoming contests. Check back soon.</Text> : null}
        {upcoming.map((contest) => <ContestRow key={contest.id} contest={contest} />)}
      </View>
      <View style={common.card}>
        <Text style={common.heading}>Past contests</Text>
        {past.length === 0 && !refreshing ? <Text style={common.muted}>Your results will appear here after your first contest.</Text> : null}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 56, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  main: { flex: 1 },
});
