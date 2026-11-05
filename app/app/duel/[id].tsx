import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { duelFinished, duelHeadline, duelLive, duelName, duelOutcome, formatClock, playerStatusText, type DuelDetail, type PlayerStatus } from 'shared/duel';
import { formatIST } from 'shared/time';
import { api, type Me } from '../../lib/api';
import { InviteCard } from '../../lib/duel-cards';
import { Avatar, Button, common, RatingChip, ScreenHeader } from '../../lib/ui';
import { theme } from '../../theme';

const POLL_MS = 5000;
const COOLDOWN = 20;
const OUTCOME_FILL = { W: theme.lime, L: theme.pink, D: theme.card2 };
const timeOfDay = (ts: number) => formatIST(ts).split(' · ')[1];

function StatusRow({ name, status, now }: { name: string; status: PlayerStatus | undefined; now: number }) {
  const state = status?.state ?? 'none';
  const look = {
    none: { backgroundColor: theme.card, color: theme.muted },
    testing: { backgroundColor: theme.sunTint, color: theme.sun },
    wrong: { backgroundColor: theme.pinkTint, color: theme.pinkSoft },
    accepted: { backgroundColor: theme.limeTint, color: theme.lime },
  }[state];
  return (
    <View style={[styles.status, { backgroundColor: look.backgroundColor }]}>
      <Text style={[common.small, common.mono]} numberOfLines={1}>{name}</Text>
      <Text style={[styles.statusText, { color: look.color }]}>{playerStatusText(status, now, timeOfDay)}</Text>
    </View>
  );
}

function Result({ duel, myId }: { duel: DuelDetail; myId: number }) {
  const [error, setError] = useState('');
  const outcome = duel.isPlayer ? duelOutcome(duel, myId) : duel.status === 'draw' ? 'D' : 'W';
  const winner = duel.winnerId === duel.challengerId ? duelName(duel.challengerUsername, duel.challengerName) : duelName(duel.opponentUsername, duel.opponentName);
  const rematch = () => api<{ id: number }>('/duels', 'POST', { rematchOf: duel.id }).then(({ id }) => router.replace({ pathname: '/duel/[id]', params: { id: String(id) } })).catch((err) => setError(err.message));
  const sides = [[duel.challengerUsername ?? duel.challengerName, duel.challengerDelta], [duel.opponentUsername ?? duel.opponentName, duel.opponentDelta]] as const;
  return (
    <View style={styles.result}>
      <View style={[styles.resultTile, { backgroundColor: OUTCOME_FILL[outcome] }]}><Text style={[styles.resultMark, outcome === 'D' && { color: theme.text }]}>{outcome}</Text></View>
      <Text style={styles.headline}>{duel.isPlayer ? duelHeadline[outcome] : duel.status === 'draw' ? 'Nobody solved it.' : `${winner} won.`}</Text>
      {duel.winningTime !== null ? <Text style={common.muted}>Accepted {formatClock(duel.winningTime)} after the start</Text> : null}
      {duel.gaveUpId && duel.winningTime === null ? <Text style={common.muted}>{duel.gaveUpId === duel.challengerId ? duelName(duel.challengerUsername, duel.challengerName) : duelName(duel.opponentUsername, duel.opponentName)} gave up</Text> : null}
      {duel.problem ? <Text style={common.link} onPress={() => Linking.openURL(duel.problem!.url)}>{duel.problem.name}</Text> : null}
      <View style={styles.deltas}>
        {sides.map(([name, delta]) => (
          <View key={name} style={styles.deltaBox}>
            <Text style={[common.small, common.mono]} numberOfLines={1}>@{name}</Text>
            <Text style={[styles.delta, { color: (delta ?? 0) >= 0 ? theme.lime : theme.pinkText }]}>{(delta ?? 0) > 0 ? '+' : ''}{delta ?? 0}</Text>
          </View>
        ))}
      </View>
      <View style={common.row}>
        {duel.isPlayer ? <Button title="Rematch" flex onPress={rematch} /> : null}
        <Button title="Back" flex variant="secondary" onPress={() => router.back()} />
      </View>
      {error ? <Text style={common.error}>{error}</Text> : null}
    </View>
  );
}

export default function Duel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [duel, setDuel] = useState<DuelDetail | null>(null);
  const [myId, setMyId] = useState(0);
  const [, setTick] = useState(0);
  const [askedAt, setAskedAt] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<DuelDetail>(`/duels/${id}`).then(setDuel).catch((err) => setError(err.message));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      api<Me>('/me').then((me) => setMyId(me.user.id)).catch(console.warn);
      const poll = setInterval(load, POLL_MS);
      return () => clearInterval(poll);
    }, [load]),
  );

  useEffect(() => {
    const clock = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(clock);
  }, []);

  async function act(path: string) {
    setError('');
    try {
      await api(`/duels/${id}/${path}`, 'POST');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  const now = Math.floor(Date.now() / 1000);
  if (!duel) return <View style={styles.page}><ScreenHeader title="Duel" />{error ? <Text style={common.error}>{error}</Text> : null}</View>;
  const challenger = duelName(duel.challengerUsername, duel.challengerName);
  const opponent = duelName(duel.opponentUsername, duel.opponentName);
  const waiting = duel.players.challenger?.state === 'testing' ? challenger : opponent;
  const cooling = (duel.lastCheckAt !== null && now - duel.lastCheckAt < COOLDOWN) || now - askedAt < COOLDOWN;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader title="Duel" />
      {duelFinished(duel.status) ? <Result duel={duel} myId={myId} /> : null}
      {duel.status === 'invited' ? <InviteCard duel={duel} myId={myId} now={now} onChange={load} onOpen={load} /> : null}
      {duel.status === 'queued' ? <View style={common.card}><Text style={common.heading}>Starting soon</Text><Text style={common.muted}>The club has 10 duels running. Yours starts as soon as a slot opens.</Text></View> : null}
      {duel.status === 'declined' || duel.status === 'expired' ? <View style={common.card}><Text style={common.heading}>This invite has ended</Text></View> : null}
      {duelLive(duel.status) ? (
        <>
          <View style={styles.faceoff}>
            <View style={duel.challengerId === myId ? styles.mine : null}><Avatar userId={duel.challengerId} name={duel.challengerName} size={48} /></View>
            <View style={styles.timer}>
              <Text style={styles.clock}>{formatClock((duel.endAt ?? now) - now)}</Text>
              <Text style={styles.live}>LIVE</Text>
            </View>
            <View style={duel.opponentId === myId ? styles.mine : null}><Avatar userId={duel.opponentId} name={duel.opponentName} size={48} /></View>
          </View>
          {duel.problem ? (
            <View style={styles.problem}>
              <View style={common.between}>
                <Text style={styles.problemName}>{duel.problem.name}</Text>
                <RatingChip value={duel.problem.rating} />
              </View>
              <Button title="Open on Codeforces" onPress={() => Linking.openURL(duel.problem!.url)} />
            </View>
          ) : <Text style={[common.muted, styles.centre]}>The problem shows here when the duel ends.</Text>}
          <StatusRow name={challenger} status={duel.players.challenger} now={now} />
          <StatusRow name={opponent} status={duel.players.opponent} now={now} />
          {duel.status === 'judging' ? <Text style={styles.strip}>Judging… Waiting for {waiting}'s earlier submission to be judged</Text> : null}
          {!duel.lastCheckOk ? <Text style={styles.strip}>Checking… Codeforces isn't answering. The result won't change.</Text> : null}
          {duel.isPlayer ? (
            <>
              <Button title={cooling ? 'Checked a moment ago' : 'I submitted, check now'} disabled={cooling} onPress={() => { setAskedAt(now); act('check'); }} />
              <Pressable accessibilityRole="button" disabled={!!duel.gaveUpId} style={styles.giveUp} onPress={() => act('give-up')}>
                <Text style={styles.giveUpText}>{duel.gaveUpId ? 'Giving up…' : 'Give up'}</Text>
              </Pressable>
            </>
          ) : null}
          <Text style={[common.small, styles.centre]}>Checked automatically every minute{duel.lastCheckAt ? ` · last check ${formatClock(now - duel.lastCheckAt)} ago` : ''}</Text>
        </>
      ) : null}
      {error ? <Text style={common.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 48, gap: 12 },
  centre: { textAlign: 'center' },
  faceoff: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mine: { padding: 3, borderRadius: 30, borderWidth: 3, borderColor: theme.lime },
  timer: { alignItems: 'center' },
  clock: { color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 52, letterSpacing: -1.5 },
  live: { color: theme.lime, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.8 },
  problem: { gap: 12, padding: 18, borderRadius: 22, backgroundColor: theme.violet },
  problemName: { flex: 1, color: theme.white, fontFamily: theme.font.display, fontSize: 20 },
  status: { gap: 2, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.line },
  statusText: { fontFamily: theme.font.bold, fontSize: 14 },
  strip: { padding: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.sunLine, backgroundColor: theme.sunTint, color: theme.sunText, fontFamily: theme.font.bold, fontSize: 13 },
  giveUp: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  giveUpText: { color: theme.pink, fontFamily: theme.font.bold, fontSize: 14 },
  result: { alignItems: 'center', gap: 12 },
  resultTile: { width: 124, height: 124, borderRadius: 26, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] },
  resultMark: { color: theme.ink, fontFamily: theme.font.display, fontSize: 60 },
  headline: { color: theme.text, fontFamily: theme.font.display, fontSize: 40, letterSpacing: -1, textAlign: 'center' },
  deltas: { flexDirection: 'row', gap: 24 },
  deltaBox: { alignItems: 'center', maxWidth: 140 },
  delta: { fontFamily: theme.font.monoHeavy, fontSize: 20 },
});
