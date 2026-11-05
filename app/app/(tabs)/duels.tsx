import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { duelName, duelOutcome, formatClock, type DuelHub } from 'shared/duel';
import { api, type Me } from '../../lib/api';
import { InviteCard } from '../../lib/duel-cards';
import { AvatarButton, Button, common } from '../../lib/ui';
import { theme } from '../../theme';

const OUTCOME_FILL = { W: theme.lime, L: theme.pink, D: theme.card2 };

export default function Duels() {
  const [hub, setHub] = useState<DuelHub | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const [nextHub, nextMe] = await Promise.all([api<DuelHub>('/duels'), api<Me>('/me')]);
      setHub(nextHub);
      setMe(nextMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load duels.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openDuel = (id: number) => router.push({ pathname: '/duel/[id]', params: { id: String(id) } });
  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.lime} />}>
      <View style={common.between}>
        <Text style={common.title}>Duels</Text>
        {me ? <AvatarButton userId={me.user.id} name={me.user.name} /> : null}
      </View>
      {error ? <Text style={common.error}>{error}</Text> : null}
      {hub && me ? (
        <>
          <View style={styles.hero}>
            <View style={common.between}>
              <View>
                <Text style={styles.heroLabel}>DUEL RATING</Text>
                <Text style={styles.heroRating}>{hub.me.rating}</Text>
              </View>
              {hub.me.weekChange ? <Text style={styles.heroChange}>{hub.me.weekChange > 0 ? '▲' : '▼'}{Math.abs(hub.me.weekChange)} this week</Text> : null}
            </View>
            <View style={styles.tiles}>
              {([['WINS', hub.me.wins], ['LOSSES', hub.me.losses], ['DRAWS', hub.me.draws]] as const).map(([label, value]) => (
                <View key={label} style={styles.tile}>
                  <Text style={styles.tileValue}>{value}</Text>
                  <Text style={styles.heroLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={common.row}>
              <Button title="Challenge someone" flex onPress={() => router.push('/duel/new')} />
              <Button title="Random" flex variant="onViolet" onPress={() => router.push({ pathname: '/duel/new', params: { random: '1' } })} />
            </View>
          </View>
          {hub.invites.map((duel) => <InviteCard key={duel.id} duel={duel} myId={me.user.id} now={hub.now} onChange={load} onOpen={openDuel} />)}
          {hub.live.length ? (
            <View style={common.card}>
              <Text style={common.heading}>Live now</Text>
              {hub.live.map((duel) => (
                <Pressable key={duel.id} accessibilityRole="button" style={styles.row} onPress={() => openDuel(duel.id)}>
                  <Text style={[styles.names, common.mono]} numberOfLines={1}>{duelName(duel.challengerUsername, duel.challengerName)} vs {duelName(duel.opponentUsername, duel.opponentName)}</Text>
                  <Text style={styles.range}>{duel.status === 'queued' ? 'Starting soon' : `${duel.ratingMin}–${duel.ratingMax}`}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={common.card}>
            <Text style={common.heading}>Recent duels</Text>
            {hub.recent.length === 0 ? <Text style={common.muted}>Your duels show up here.</Text> : null}
            {hub.recent.map((duel) => {
              const outcome = duelOutcome(duel, me.user.id);
              const mineFirst = duel.challengerId === me.user.id;
              const delta = (mineFirst ? duel.challengerDelta : duel.opponentDelta) ?? 0;
              return (
                <Pressable key={duel.id} accessibilityRole="button" style={styles.row} onPress={() => openDuel(duel.id)}>
                  <View style={[styles.outcome, { backgroundColor: OUTCOME_FILL[outcome] }]}><Text style={[styles.outcomeText, outcome === 'D' && { color: theme.text }]}>{outcome}</Text></View>
                  <View style={styles.names}>
                    <Text style={common.bold} numberOfLines={1}>vs {mineFirst ? duelName(duel.opponentUsername, duel.opponentName) : duelName(duel.challengerUsername, duel.challengerName)}</Text>
                    <Text style={common.small}>{duel.status === 'draw' ? 'nobody solved it' : duel.gaveUpId ? 'gave up' : duel.winningTime !== null ? `solved in ${formatClock(duel.winningTime)}` : 'finished'}</Text>
                  </View>
                  <Text style={[styles.delta, { color: delta >= 0 ? theme.lime : theme.pinkText }]}>{delta > 0 ? '+' : ''}{delta}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={common.card}>
            <Text style={common.heading}>Duel board</Text>
            {hub.board.length === 0 ? <Text style={common.muted}>Play a duel to get on the board.</Text> : null}
            {hub.board.map((row, index) => (
              <View key={row.userId} style={[styles.row, row.userId === me.user.id && styles.myRow]}>
                <Text style={styles.rank}>{index + 1}</Text>
                <Text style={[styles.names, common.mono, styles.boardName]} numberOfLines={1}>{duelName(row.username, row.name)}</Text>
                <Text style={common.small}>{row.wins}–{row.losses}</Text>
                <Text style={styles.boardRating}>{row.rating}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 56, gap: 14 },
  hero: { gap: 12, padding: 18, borderRadius: 22, backgroundColor: theme.violet },
  heroLabel: { color: theme.violetSoft, fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.8 },
  heroRating: { color: theme.white, fontFamily: theme.font.monoHeavy, fontSize: 48, letterSpacing: -1.4 },
  heroChange: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.lime, color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 12 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 14, backgroundColor: theme.violetDeep },
  tileValue: { color: theme.white, fontFamily: theme.font.monoHeavy, fontSize: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  myRow: { paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, borderColor: theme.limeLine, backgroundColor: theme.limeTint },
  names: { flex: 1 },
  range: { color: theme.lime, fontFamily: theme.font.monoBold, fontSize: 12 },
  outcome: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  outcomeText: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 14 },
  delta: { fontFamily: theme.font.monoHeavy, fontSize: 13 },
  rank: { width: 24, color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 14 },
  boardName: { color: theme.text, fontSize: 13 },
  boardRating: { color: theme.lime, fontFamily: theme.font.monoHeavy, fontSize: 14 },
});
