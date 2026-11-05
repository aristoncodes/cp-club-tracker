import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DUEL_CHOICES, DUEL_MINUTES, duelName, duelRange, type Difficulty } from 'shared/duel';
import { api, type Me } from '../../lib/api';
import { Avatar, Button, common, Rating, ScreenHeader } from '../../lib/ui';
import { theme } from '../../theme';

type Opponent = { id: number; name: string; username: string | null; cfRating: number | null; duelRating: number };

export default function NewDuel() {
  const params = useLocalSearchParams<{ random?: string }>();
  const [myRating, setMyRating] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Opponent[]>([]);
  const [selected, setSelected] = useState<Opponent | null>(null);
  const [random, setRandom] = useState(params.random === '1');
  const [difficulty, setDifficulty] = useState<Difficulty>('even');
  const [minutes, setMinutes] = useState(45);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Me>('/me').then((me) => setMyRating(me.user.cfRating)).catch(console.warn);
  }, []);

  useEffect(() => {
    api<Opponent[]>(`/duels/opponents?q=${encodeURIComponent(query)}`).then(setPeople).catch((err) => setError(err.message));
  }, [query]);

  const theirs = selected?.cfRating ?? myRating;
  const range = duelRange(difficulty, myRating, theirs);
  const who = random ? 'someone within 200' : selected ? duelName(selected.username, selected.name) : null;

  async function send() {
    setError('');
    try {
      const { id } = await api<{ id: number }>('/duels', 'POST', { opponentId: selected?.id, random, difficulty, minutes });
      router.replace({ pathname: '/duel/[id]', params: { id: String(id) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the challenge.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="New duel" />
      <TextInput style={common.input} value={query} onChangeText={setQuery} placeholder="Search members" placeholderTextColor={theme.muted} autoCapitalize="none" accessibilityLabel="Search members" />
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: random }} style={[styles.person, random && styles.personOn]} onPress={() => { setRandom(true); setSelected(null); }}>
        <Text style={[common.bold, styles.main]}>Random, within 200 rating</Text>
        <View style={[styles.radio, random && styles.radioOn]}><Text style={styles.radioMark}>{random ? '✓' : ''}</Text></View>
      </Pressable>
      {people.map((person) => {
        const on = !random && selected?.id === person.id;
        return (
          <Pressable key={person.id} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.person, on && styles.personOn]} onPress={() => { setSelected(person); setRandom(false); }}>
            <Avatar userId={person.id} name={person.name} size={36} />
            <View style={styles.main}>
              <Text style={[common.bold, common.mono]} numberOfLines={1}>{duelName(person.username, person.name)}</Text>
              <Text style={common.small}><Rating value={person.cfRating} /> · duel {person.duelRating}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}><Text style={styles.radioMark}>{on ? '✓' : ''}</Text></View>
          </Pressable>
        );
      })}
      <Text style={common.label}>DIFFICULTY</Text>
      <View style={common.row}>
        {DUEL_CHOICES.map((choice) => {
          const shown = duelRange(choice.id, myRating, theirs);
          const on = difficulty === choice.id;
          return (
            <Pressable key={choice.id} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.choice, on && styles.choiceOn]} onPress={() => setDifficulty(choice.id)}>
              <Text style={[common.bold, on && styles.inkText]}>{choice.label}</Text>
              <Text style={[styles.choiceRange, on && styles.inkText]}>{shown.min}–{shown.max}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={common.label}>TIME LIMIT</Text>
      <View style={common.row}>
        {DUEL_MINUTES.map((value) => (
          <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: minutes === value }} style={[styles.minutes, minutes === value && styles.choiceOn]} onPress={() => setMinutes(value)}>
            <Text style={[styles.minutesText, minutes === value && styles.inkText]}>{value}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.note}><Text style={styles.noteText}>The first Accepted on Codeforces wins, by its submission time. If nobody solves it in time, it's a draw.</Text></View>
      {error ? <Text style={common.error}>{error}</Text> : null}
      <Button title={who ? `Challenge ${who} · ${range.min}–${range.max} · ${minutes} min` : 'Pick an opponent'} disabled={!who} onPress={send} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 48, gap: 10 },
  main: { flex: 1 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, padding: 8, borderRadius: 14 },
  personOn: { backgroundColor: theme.limeTint },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: theme.lime, borderColor: theme.lime },
  radioMark: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 12 },
  choice: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderColor: theme.line },
  choiceOn: { backgroundColor: theme.lime, borderColor: theme.lime },
  choiceRange: { color: theme.muted, fontFamily: theme.font.monoBold, fontSize: 11 },
  inkText: { color: theme.ink },
  minutes: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderColor: theme.line },
  minutesText: { color: theme.muted, fontFamily: theme.font.monoHeavy, fontSize: 14 },
  note: { padding: 12, borderRadius: 14, backgroundColor: theme.violetTint },
  noteText: { color: theme.violetSoft, fontFamily: theme.font.regular, fontSize: 12 },
});
