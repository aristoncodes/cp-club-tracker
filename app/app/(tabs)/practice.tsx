import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GOAL_RATINGS, GOAL_TARGETS } from 'shared/goal';
import { problemLetter } from 'shared/upsolve';
import { api, type Goal, type Me, type Potd, type Upsolve } from '../../lib/api';
import { GoalRing, PotdCard } from '../../lib/practice-cards';
import { Button, common, RatingChip } from '../../lib/ui';
import { theme } from '../../theme';

function timeLeft(until: number): string {
  const left = Math.max(0, until - Math.floor(Date.now() / 1000));
  return `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m`;
}

function GoalEditor({ data, onChange }: { data: Goal; onChange: () => void }) {
  const [target, setTarget] = useState(data.goal?.target ?? 5);
  const [minRating, setMinRating] = useState(data.goal?.minRating ?? 1200);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await api('/practice/goal', 'PUT', { target, minRating });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  const left = data.goal ? Math.max(0, data.goal.target - data.done) : 0;
  return (
    <View style={common.card}>
      <Text style={common.heading}>Weekly goal</Text>
      {data.goal ? (
        <View style={common.row}>
          <GoalRing done={data.done} target={data.goal.target} />
          <Text style={common.text}>{data.goal.target} at {data.goal.minRating}+ · {left ? `${left} to go` : 'done!'}</Text>
        </View>
      ) : (
        <Text style={common.muted}>{data.locked ? 'Goals lock on Thursday. Set a new one on Monday.' : 'Pick a goal for this week.'}</Text>
      )}
      {data.locked ? null : (
        <>
          <Text style={common.label}>PROBLEMS</Text>
          <View style={common.row}>
            {GOAL_TARGETS.map((value) => (
              <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: target === value }} onPress={() => setTarget(value)} style={[styles.chip, target === value && styles.chipOn]}>
                <Text style={[styles.chipText, target === value && styles.chipTextOn]}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={common.label}>RATED AT LEAST</Text>
          <View style={common.row}>
            {GOAL_RATINGS.map((value) => (
              <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: minRating === value }} onPress={() => setMinRating(value)} style={[styles.chip, minRating === value && styles.chipOn]}>
                <Text style={[styles.chipText, minRating === value && styles.chipTextOn]}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={common.small}>Based on your last 4 weeks, try {data.suggestions[minRating]}. You can change it until Wednesday.</Text>
          <Button title="Save" onPress={save} />
          {error ? <Text style={common.error}>{error}</Text> : null}
        </>
      )}
    </View>
  );
}

export default function Practice() {
  const [potd, setPotd] = useState<Potd | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [upsolves, setUpsolves] = useState<Upsolve[]>([]);
  const [weakTags, setWeakTags] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const me = await api<Me>('/me');
      const [nextPotd, nextGoal, nextUpsolves, profile] = await Promise.all([
        api<Potd>('/practice/potd'),
        api<Goal>('/practice/goal'),
        api<Upsolve[]>('/practice/upsolves'),
        api<{ weakTags: { tag: string }[] }>(`/users/${me.user.id}`),
      ]);
      setPotd(nextPotd);
      setGoal(nextGoal);
      setUpsolves(nextUpsolves);
      setWeakTags(profile.weakTags.map((t) => t.tag));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Practice.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const contests = [...new Set(upsolves.map((row) => row.contestId))];
  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.lime} />}>
      <Text style={common.title}>Practice</Text>
      {error ? <Text style={common.error}>{error}</Text> : null}
      {potd ? <PotdCard data={potd} onChange={load} /> : null}
      {potd?.problem ? (
        <View style={common.card}>
          <View style={common.between}>
            <Text style={common.heading}>This week</Text>
            <Text style={common.small}>next in <Text style={common.mono}>{timeLeft(potd.nextAt)}</Text></Text>
          </View>
          <View style={styles.strip}>
            {potd.strip.map((day, index) => (
              <View key={index} style={[styles.stripDay, day.state === 'done' && styles.stripDone, day.state === 'today' && styles.stripToday]}>
                <Text style={styles.stripMark}>{day.state === 'done' ? '✓' : day.label}</Text>
              </View>
            ))}
          </View>
          <Text style={common.small}>{potd.members.filter((m) => m.solvedAt).map((m) => `@${m.username ?? m.name}`).join(', ') || 'Nobody in your band has solved it yet.'}</Text>
        </View>
      ) : null}
      {goal ? <GoalEditor key={String(goal.goal?.target)} data={goal} onChange={load} /> : null}
      <View style={common.card}>
        <View style={common.between}>
          <Text style={common.heading}>Upsolve</Text>
          <Text style={common.small}>{upsolves.filter((row) => !row.done).length} left</Text>
        </View>
        {upsolves.length === 0 && !refreshing ? <Text style={common.muted}>Your upsolves appear after your next counted Codeforces round.</Text> : null}
        {contests.map((id) => {
          const items = upsolves.filter((row) => row.contestId === id);
          return (
            <View key={id} style={styles.group}>
              <Text style={common.label}>{items[0].contestName.toUpperCase()}</Text>
              {items.map((item) => (
                <Pressable key={item.problemId} accessibilityRole="link" disabled={!item.url} onPress={() => item.url && Linking.openURL(item.url)} style={[styles.upsolve, item.done ? styles.upsolveDone : null]}>
                  <View style={[styles.letter, item.done ? styles.letterDone : null]}><Text style={[styles.letterText, item.done ? styles.chipTextOn : null]}>{item.done ? '✓' : problemLetter(item.problemId)}</Text></View>
                  <Text style={[common.bold, styles.grow, item.done ? styles.struck : null]} numberOfLines={1}>{item.name ?? item.problemId}</Text>
                  {item.rating ? <RatingChip value={item.rating} /> : null}
                  <Text style={common.link}>Open</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
      </View>
      {weakTags.length ? (
        <View style={common.card}>
          <Text style={common.heading}>Train a weak topic</Text>
          <View style={styles.tags}>
            {weakTags.map((tag) => (
              <Pressable key={tag} accessibilityRole="link" style={styles.tag} onPress={() => Linking.openURL(`https://codeforces.com/problemset?tags=${encodeURIComponent(tag)}`)}>
                <Text style={common.bold}>{tag}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 56, gap: 14 },
  chip: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderColor: theme.line },
  chipOn: { backgroundColor: theme.lime, borderColor: theme.lime },
  chipText: { color: theme.muted, fontFamily: theme.font.monoHeavy, fontSize: 13 },
  chipTextOn: { color: theme.ink },
  strip: { flexDirection: 'row', gap: 6 },
  stripDay: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: theme.card2 },
  stripDone: { backgroundColor: theme.lime },
  stripToday: { borderWidth: 2, borderStyle: 'dashed', borderColor: theme.lime },
  stripMark: { color: theme.muted, fontFamily: theme.font.bold, fontSize: 12 },
  group: { gap: 8 },
  upsolve: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  upsolveDone: { opacity: 0.65 },
  letter: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.card2 },
  letterDone: { backgroundColor: theme.lime },
  letterText: { color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 12 },
  grow: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 2, borderColor: theme.line },
});
