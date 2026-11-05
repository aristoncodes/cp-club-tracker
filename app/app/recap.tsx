import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatIST } from 'shared/time';
import { api, type Me } from '../lib/api';
import { Avatar, common } from '../lib/ui';
import { theme } from '../theme';

type Recap = {
  week: number;
  points: number;
  rank: number | null;
  rankChange: number | null;
  solves: number;
  hardest: { rp: number } | null;
  contests: number;
  streak: number;
  topTopic: string | null;
  duels: { wins: number; losses: number; draws: number };
  goal: { target: number; minRating: number; done: number } | null;
  shoutout: { kind: string; userId: number; name: string; username: string | null; gained: number } | null;
  upcoming: { id: number; name: string; startAt: number }[];
};

const DAY = 86400;
const PAGES = 3;

function Highlight({ glyph, color, label, value }: { glyph: string; color: string; label: string; value: string }) {
  return (
    <View style={styles.highlight}>
      <View style={[styles.glyph, { backgroundColor: color }]}><Text style={styles.glyphText}>{glyph}</Text></View>
      <View style={styles.main}>
        <Text style={styles.small}>{label}</Text>
        <Text style={styles.value} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

export default function RecapScreen() {
  const [data, setData] = useState<Recap | null>(null);
  const [name, setName] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      Promise.all([api<Recap>('/recap'), api<Me>('/me')])
        .then(([recap, me]) => {
          setData(recap);
          setName(me.user.name.split(' ')[0]);
        })
        .catch((err) => setError(err.message));
    }, []),
  );

  if (error) return <View style={styles.page}><Text style={common.error}>{error}</Text></View>;
  if (!data) return <View style={styles.page} />;
  const headlines = [`Big week, ${name}.`, 'Your highlights.', 'Around the club.'];
  const date = (ts: number) => formatIST(ts).split(', ')[1].split(' · ')[0];
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <View style={styles.segments}>
          {Array.from({ length: PAGES }, (_, index) => <View key={index} style={[styles.segment, { opacity: index <= page ? 1 : 0.3 }]} />)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}><Text style={styles.close}>×</Text></Pressable>
      </View>
      <Text style={styles.eyebrow}>Your week · {date(data.week)} – {date(data.week + 6 * DAY)}</Text>
      <Text style={styles.headline}>{headlines[page]}</Text>
      <View style={styles.body}>
        {page === 0 ? (
          <>
            <View style={styles.points}>
              <Text style={styles.pointsLabel}>POINTS</Text>
              <Text style={styles.pointsValue}>{data.points}</Text>
              <Text style={styles.pointsRank}>{data.rank ? `Rank #${data.rank}` : 'Not on the board this week'}{data.rankChange ? ` · ${data.rankChange > 0 ? '▲' : '▼'}${Math.abs(data.rankChange)}` : ''}</Text>
            </View>
            <View style={styles.pair}>
              <View style={styles.tile}><Text style={styles.tileValue}>{data.solves}</Text><Text style={styles.small}>Solves{data.hardest ? ` · hardest ${data.hardest.rp}` : ''}</Text></View>
              <View style={styles.tile}><Text style={styles.tileValue}>{data.contests}</Text><Text style={styles.small}>Contests attended</Text></View>
            </View>
          </>
        ) : null}
        {page === 1 ? (
          <>
            <Highlight glyph="7d" color={theme.sun} label="STREAK" value={`${data.streak} ${data.streak === 1 ? 'day' : 'days'}`} />
            <Highlight glyph="#" color={theme.sky} label="TOP TOPIC" value={data.topTopic ?? 'Nothing yet this week'} />
            <Highlight glyph="VS" color={theme.pink} label="DUELS" value={`${data.duels.wins}W · ${data.duels.losses}L · ${data.duels.draws}D`} />
            <Highlight glyph="GO" color={theme.lime} label="WEEKLY GOAL" value={data.goal ? `${data.goal.done} of ${data.goal.target} at ${data.goal.minRating}+` : 'No goal this week'} />
          </>
        ) : null}
        {page === 2 ? (
          <>
            {data.shoutout ? (
              <View style={styles.shoutout}>
                <Avatar userId={data.shoutout.userId} name={data.shoutout.name} size={48} />
                <View style={styles.main}>
                  <Text style={styles.shoutoutName} numberOfLines={1}>@{data.shoutout.username ?? data.shoutout.name}</Text>
                  <Text style={common.muted}>{data.shoutout.kind === 'climber' ? `Climbed ${data.shoutout.gained} places this week` : 'Top of the board this week'}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.tile}>
              <Text style={styles.small}>NEXT WEEK</Text>
              {data.upcoming.length === 0 ? <Text style={styles.value}>Nothing scheduled yet.</Text> : null}
              {data.upcoming.map((contest) => <Text key={contest.id} style={styles.value} numberOfLines={1}>{formatIST(contest.startAt).split(' · ')[0]} · {contest.name}</Text>)}
            </View>
          </>
        ) : null}
      </View>
      {page < PAGES - 1 ? (
        <Pressable accessibilityRole="button" style={styles.next} onPress={() => setPage(page + 1)}><Text style={styles.nextText}>Next</Text></Pressable>
      ) : (
        <View style={styles.pair}>
          <Pressable accessibilityRole="button" style={styles.replay} onPress={() => setPage(0)}><Text style={styles.value}>Replay</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.done} onPress={() => router.back()}><Text style={styles.doneText}>Done</Text></Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.violet },
  content: { flexGrow: 1, gap: 14, padding: theme.gutter, paddingTop: 48 },
  main: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  segments: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.white },
  close: { color: theme.white, fontSize: 28 },
  eyebrow: { color: theme.violetSoft, fontFamily: theme.font.bold, fontSize: 13 },
  headline: { color: theme.white, fontFamily: theme.font.display, fontSize: 40, letterSpacing: -1 },
  body: { flex: 1, gap: 10 },
  points: { gap: 2, padding: 20, borderRadius: 22, backgroundColor: theme.lime, transform: [{ rotate: '-2deg' }] },
  pointsLabel: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.8 },
  pointsValue: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 64, letterSpacing: -2 },
  pointsRank: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 14 },
  pair: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, gap: 4, padding: 12, borderRadius: 14, backgroundColor: theme.violetDeep },
  tileValue: { color: theme.white, fontFamily: theme.font.monoHeavy, fontSize: 28 },
  small: { color: theme.violetSoft, fontFamily: theme.font.bold, fontSize: 11 },
  value: { color: theme.white, fontFamily: theme.font.bold, fontSize: 14 },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: theme.violetDeep },
  glyph: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  glyphText: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 14 },
  shoutout: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 22, backgroundColor: theme.ink, transform: [{ rotate: '-2deg' }] },
  shoutoutName: { color: theme.lime, fontFamily: theme.font.monoBold, fontSize: 15 },
  next: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: theme.white },
  nextText: { color: theme.violetText, fontFamily: theme.font.bold, fontSize: 15 },
  replay: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderColor: theme.violetSoft },
  done: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: theme.lime },
  doneText: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 15 },
});
