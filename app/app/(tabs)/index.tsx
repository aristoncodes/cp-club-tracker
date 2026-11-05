import { Feather } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RSVP_REASONS } from 'shared/reasons';
import { solvePoints } from 'shared/scoring';
import { formatIST, istDay, solvesText, weekStrip } from 'shared/time';
import { ApiError, api, clearSession, getSession, type Announcement, type Goal, type Me, type Potd, type Rival, type Upsolve } from '../../lib/api';
import { Celebration } from '../../lib/badge-tile';
import { GoalRing, PotdCard } from '../../lib/practice-cards';
import { registerPushToken } from '../../lib/push';
import { AvatarButton, BellButton, Button, openLink, StreakPill } from '../../lib/ui';
import { theme } from '../../theme';

type Contest = { id: number; platform: string; name: string; startAt: number; rsvp: string | null; goingCount: number; participantCount: number };
type Destination = 'login' | 'signup' | null;
type LiveRival = Extract<Rival, { me: unknown }>;
type Standing = { userId: number; name: string; rank: number; points: number; solves: number; cfRating: number | null };
type Profile = { heatmap: { day: number; count: number }[]; today: number };

const PLATFORM_LABELS: Record<string, string> = { cf: 'Codeforces', cc: 'CodeChef' };
const HINT_RATING = 1500;

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{String(value).padStart(2, '0')}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function NextContest({ contest, onChange }: { contest: Contest; onChange: () => void }) {
  const [choosing, setChoosing] = useState(false);
  const [reasonType, setReasonType] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState('');
  const left = Math.max(0, contest.startAt - Math.floor(Date.now() / 1000));
  const [date, time] = formatIST(contest.startAt).split(' · ');

  async function send(body: Record<string, unknown>) {
    setError('');
    try {
      await api(`/contests/${contest.id}/rsvp`, 'POST', body);
      setChoosing(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    }
  }

  return (
    <View style={styles.contest}>
      <View style={styles.between}>
        <Text style={styles.platform}>{(PLATFORM_LABELS[contest.platform] ?? contest.platform).toUpperCase()}</Text>
        <Text style={styles.contestTime}>{date.split(',')[0]} · {time}</Text>
      </View>
      <Text style={styles.contestName}>{contest.name}</Text>
      <View style={styles.tiles}>
        <Tile value={Math.floor(left / 86400)} label="DAYS" />
        <Tile value={Math.floor((left % 86400) / 3600)} label="HRS" />
        <Tile value={Math.floor((left % 3600) / 60)} label="MIN" />
      </View>
      {contest.rsvp === 'yes' && !choosing ? (
        <View style={styles.inStrip}>
          <Text style={styles.inText}>You're in. Good luck!</Text>
          <Pressable accessibilityRole="button" onPress={() => setChoosing(true)} hitSlop={12}><Text style={styles.change}>Change</Text></Pressable>
        </View>
      ) : null}
      {!contest.rsvp && !choosing ? (
        <View style={styles.row}>
          <Button title="I'm in" flex onPress={() => send({ going: true })} />
          <Button title="Can't" flex variant="onViolet" onPress={() => setChoosing(true)} />
        </View>
      ) : null}
      {contest.rsvp === 'no' && !choosing ? (
        <View style={styles.answered}>
          <Text style={styles.contestTime}>You can't make this one.</Text>
          <Button title="Actually, I'm in" onPress={() => send({ going: true })} />
        </View>
      ) : null}
      {choosing ? (
        <View style={styles.choose}>
          <Text style={styles.chooseTitle}>What's stopping you?</Text>
          <View style={styles.chips}>
            {RSVP_REASONS.map((reason) => {
              const selected = reason.id === reasonType;
              return (
                <Pressable
                  key={reason.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setReasonType(reason.id)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{reason.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {reasonType === 'other' ? (
            <TextInput style={styles.input} value={reasonText} onChangeText={setReasonText} placeholder="Tell us a little more" placeholderTextColor={theme.muted} />
          ) : null}
          <View style={styles.row}>
            <Button title="Send" flex disabled={!reasonType || (reasonType === 'other' && !reasonText.trim())} onPress={() => send({ going: false, reasonType, reasonText })} />
            <Button title="I'm in" flex variant="onViolet" onPress={() => send({ going: true })} />
          </View>
        </View>
      ) : null}
      {error ? <Text style={styles.contestError}>{error}</Text> : null}
      <Text style={styles.going}><Text style={styles.goingNumber}>{contest.goingCount}</Text> of {contest.participantCount} are going</Text>
    </View>
  );
}

function RivalCard({ data }: { data: LiveRival }) {
  const lead = Math.round((data.me.points - data.them.points) * 10) / 10;
  const first = data.rival.name.split(' ')[0];
  const rows = [['Points', data.me.points, data.them.points], ['Solves', data.me.solves, data.them.solves], ['Contests', data.me.contests, data.them.contests]] as const;
  return (
    <Pressable accessibilityRole="button" style={styles.card} onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(data.rival.id) } })}>
      <View style={styles.between}>
        <Text style={styles.cardTitle}>You vs @{data.rival.username ?? first}</Text>
        <Text style={[styles.rivalLead, { color: lead >= 0 ? theme.lime : theme.pink }]}>{lead === 0 ? 'Level' : lead > 0 ? `You lead by ${lead}` : `${first} leads by ${-lead}`}</Text>
      </View>
      {rows.map(([label, mine, theirs]) => (
        <View key={label} style={styles.rivalRow}>
          <Text style={[styles.rivalValue, { color: mine >= theirs ? theme.lime : theme.muted }]}>{Math.round(mine * 10) / 10}</Text>
          <Text style={styles.statLabel}>{label}</Text>
          <Text style={[styles.rivalValue, { color: theirs > mine ? theme.pinkText : theme.muted }]}>{Math.round(theirs * 10) / 10}</Text>
        </View>
      ))}
    </Pressable>
  );
}

function StatCard({ label, standing, accent }: { label: string; standing?: Standing; accent?: boolean }) {
  return (
    <View style={[styles.card, styles.flexOne]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.bigStat, accent && styles.limeText]}>{standing?.points ?? 0}</Text>
      <Text style={styles.muted}>{standing ? `#${standing.rank} in club · ${solvesText(standing.solves)}` : 'Not ranked yet'}</Text>
    </View>
  );
}

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [dayRows, setDayRows] = useState<Standing[]>([]);
  const [weekRows, setWeekRows] = useState<Standing[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pinned, setPinned] = useState<Announcement | null>(null);
  const [potd, setPotd] = useState<Potd | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [upsolves, setUpsolves] = useState<Upsolve[]>([]);
  const [rival, setRival] = useState<Rival | null>(null);
  const [destination, setDestination] = useState<Destination>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    if (!(await getSession())) return setDestination('login');
    try {
      const meData = await api<Me>('/me');
      if (meData.user.onboardingStep !== 'done') return setDestination('signup');
      registerPushToken().catch(console.warn);
      const [upcoming, day, week, userProfile, inbox, nextPotd, nextGoal, nextUpsolves, nextRival] = await Promise.all([
        api<Contest[]>('/contests/upcoming'),
        api<Standing[]>('/leaderboard?period=day'),
        api<Standing[]>('/leaderboard?period=week'),
        api<Profile>(`/users/${meData.user.id}`),
        api<{ pinned: Announcement | null }>('/announcements'),
        api<Potd>('/practice/potd'),
        api<Goal>('/practice/goal'),
        api<Upsolve[]>('/practice/upsolves'),
        api<Rival>('/me/rival'),
      ]);
      setRival(nextRival);
      setPinned(inbox.pinned);
      setPotd(nextPotd);
      setGoal(nextGoal);
      setUpsolves(nextUpsolves);
      setMe(meData);
      setContests(upcoming);
      setDayRows(day);
      setWeekRows(week);
      setProfile(userProfile);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await clearSession();
        return setDestination('login');
      }
      setError(err instanceof Error ? err.message : 'Could not load. Please try again.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (destination) return <Redirect href={`/${destination}`} />;

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Button title="Try again" variant="secondary" onPress={load} />
      </View>
    );
  }

  if (!me) return null;

  const myIndex = weekRows.findIndex((row) => row.userId === me.user.id);
  const mine = weekRows[myIndex];
  const above = weekRows[myIndex - 1];
  const today = profile?.today ?? istDay(Date.now() / 1000);
  const strip = weekStrip(profile?.heatmap ?? [], today);
  const solvedToday = strip.every((day) => day.state !== 'today');
  const upsolvesLeft = upsolves.filter((row) => !row.done);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {me.newBadges[0] ? <Celebration id={me.newBadges[0]} onDone={() => api('/badges/seen', 'POST').finally(load)} /> : null}
      <View style={styles.between}>
        <View style={styles.flexOne}>
          <Text style={styles.muted}>{formatIST(Date.now() / 1000).split(' · ')[0]}</Text>
          <Text style={styles.greeting} numberOfLines={1}>Hey {me.user.name.split(' ')[0]}</Text>
        </View>
        <View style={styles.row}>
          <BellButton unread={me.unreadAnnouncements} />
          <StreakPill streak={me.streak} />
          <AvatarButton userId={me.user.id} name={me.user.name} />
        </View>
      </View>
      {pinned ? (
        <Pressable accessibilityRole={pinned.link ? 'link' : undefined} disabled={!pinned.link} style={styles.pinned} onPress={() => pinned.link && openLink(pinned.link)}>
          <Feather name="map-pin" size={16} color={theme.violetSoft} />
          <View style={styles.flexOne}>
            <Text style={styles.pinnedTitle} numberOfLines={1}>{pinned.title}</Text>
            <Text style={styles.pinnedBody} numberOfLines={1}>{pinned.body}</Text>
          </View>
        </Pressable>
      ) : null}
      {me.handles.some((h) => !h.approved) ? (
        <Pressable accessibilityRole="button" style={styles.banner} onPress={() => router.push('/settings')}>
          <View style={styles.bannerTile}><Text style={styles.bannerMark}>!</Text></View>
          <Text style={styles.bannerText}><Text style={styles.bannerBold}>Waiting for approval.</Text> A coordinator checks each handle.</Text>
          <Feather name="chevron-right" size={20} color={theme.sunText} />
        </Pressable>
      ) : null}
      {me.pendingReasons.map((contest) => (
        <Pressable
          key={contest.id}
          accessibilityRole="button"
          style={styles.banner}
          onPress={() => router.push({ pathname: '/reason', params: { contestId: String(contest.id) } })}
        >
          <View style={styles.bannerTile}><Text style={styles.bannerMark}>!</Text></View>
          <Text style={styles.bannerText}><Text style={styles.bannerBold}>Missed {contest.name}.</Text> Tap to add a reason.</Text>
          <Feather name="chevron-right" size={20} color={theme.sunText} />
        </Pressable>
      ))}
      {contests[0] ? <NextContest contest={contests[0]} onChange={load} /> : <View style={styles.card}><Text style={styles.muted}>No contests coming up yet. Check back soon.</Text></View>}
      {potd ? <PotdCard data={potd} onChange={load} /> : null}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" style={[styles.card, styles.flexOne]} onPress={() => router.push('/practice')}>
          <GoalRing done={goal?.done ?? 0} target={goal?.goal?.target ?? 0} />
          <Text style={styles.statLabel}>{goal?.goal ? `${goal.goal.target} at ${goal.goal.minRating}+` : 'Set a goal'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={[styles.card, styles.flexOne]} onPress={() => router.push('/practice')}>
          <View style={styles.upsolveTile}><Text style={styles.upsolveCount}>{upsolvesLeft.length}</Text></View>
          <Text style={styles.statLabel} numberOfLines={2}>{upsolvesLeft.length ? `Upsolves left from ${upsolvesLeft[0].contestName}` : 'No upsolves left'}</Text>
        </Pressable>
      </View>
      {rival && 'me' in rival ? <RivalCard data={rival} /> : null}
      <View style={styles.row}>
        <StatCard label="Today" accent standing={dayRows.find((row) => row.userId === me.user.id)} />
        <StatCard label="This week" standing={mine} />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Streak</Text>
        <View style={styles.strip}>
          {strip.map((day, index) => (
            <View key={index} style={styles.stripDay}>
              <View style={[styles.stripTile, day.state === 'done' && styles.stripDone, day.state === 'today' && styles.stripToday]}>
                <Text style={styles.stripMark}>{day.state === 'done' ? '✓' : day.state === 'today' ? '·' : ''}</Text>
              </View>
              <Text style={styles.statLabel}>{day.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.muted}>
          {solvedToday ? `Solved today. Streak is at ${me.streak}.` : `Solve one problem today to make it ${me.streak + 1}.`}
        </Text>
      </View>
      <Pressable style={styles.card} accessibilityRole="button" onPress={() => router.push('/leaderboard')}>
        <View style={styles.between}>
          <Text style={styles.cardTitle}>Chasing</Text>
          <Text style={styles.link}>Leaderboard →</Text>
        </View>
        <Text style={styles.muted}>
          {!mine
            ? 'One solve this week gets you on the board.'
            : above
              ? `${above.name.split(' ')[0]} is ${Math.round((above.points - mine.points) * 10) / 10} pts ahead. One ${HINT_RATING} problem is worth about ${solvePoints(HINT_RATING, mine.cfRating, false)}.`
              : "You're at the top this week. Nobody's ahead of you."}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 56, gap: 14 },
  centered: { flex: 1, justifyContent: 'center', padding: theme.gutter, gap: 16 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flexOne: { flex: 1 },
  greeting: { color: theme.text, fontFamily: theme.font.display, fontSize: 28, letterSpacing: -0.8 },
  muted: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 13 },
  error: { color: theme.pink, fontFamily: theme.font.regular, fontSize: 14 },
  rivalLead: { fontFamily: theme.font.bold, fontSize: 12 },
  rivalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rivalValue: { width: 72, textAlign: 'center', fontFamily: theme.font.monoHeavy, fontSize: 15 },
  upsolveTile: { width: 64, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.pink },
  upsolveCount: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 26 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: theme.violetTint },
  pinnedTitle: { color: theme.text, fontFamily: theme.font.bold, fontSize: 14 },
  pinnedBody: { color: theme.violetSoft, fontFamily: theme.font.regular, fontSize: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 44, borderRadius: 16, borderWidth: 1, borderColor: theme.sunLine, backgroundColor: theme.sunTint },
  bannerTile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.sun },
  bannerMark: { color: theme.ink, fontFamily: theme.font.display, fontSize: 18 },
  bannerText: { flex: 1, color: theme.sunText, fontFamily: theme.font.regular, fontSize: 14 },
  bannerBold: { fontFamily: theme.font.bold },
  contest: { gap: 12, padding: 18, borderRadius: 22, backgroundColor: theme.violet },
  platform: { overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.white, color: theme.violetText, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.8 },
  contestTime: { color: theme.violetPale, fontFamily: theme.font.semibold, fontSize: 13 },
  contestName: { color: theme.white, fontFamily: theme.font.display, fontSize: 22, letterSpacing: -0.4 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 14, backgroundColor: theme.violetDeep },
  tileValue: { color: theme.white, fontFamily: theme.font.monoHeavy, fontSize: 24 },
  tileLabel: { color: theme.violetSoft, fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.8 },
  inStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 18, borderRadius: 999, backgroundColor: theme.lime },
  inText: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 14 },
  change: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 14, textDecorationLine: 'underline' },
  answered: { gap: 8 },
  choose: { gap: 10 },
  chooseTitle: { color: theme.white, fontFamily: theme.font.bold, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 2, borderColor: theme.violetSoft },
  chipSelected: { backgroundColor: theme.lime, borderColor: theme.lime },
  chipText: { color: theme.white, fontFamily: theme.font.bold, fontSize: 13 },
  chipTextSelected: { color: theme.ink },
  input: { height: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: theme.card, color: theme.text, fontFamily: theme.font.regular, fontSize: 14 },
  contestError: { padding: 10, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.ink, color: theme.pink, fontFamily: theme.font.regular, fontSize: 13 },
  going: { color: theme.violetPale, fontFamily: theme.font.regular, fontSize: 13 },
  goingNumber: { color: theme.white, fontFamily: theme.font.monoHeavy },
  card: { gap: 10, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  statLabel: { color: theme.muted, fontFamily: theme.font.bold, fontSize: 12 },
  bigStat: { color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 32, letterSpacing: -1 },
  limeText: { color: theme.lime },
  cardTitle: { color: theme.text, fontFamily: theme.font.display, fontSize: 18, letterSpacing: -0.3 },
  link: { color: theme.lime, fontFamily: theme.font.bold, fontSize: 13 },
  strip: { flexDirection: 'row', gap: 6 },
  stripDay: { flex: 1, alignItems: 'center', gap: 4 },
  stripTile: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: theme.card2 },
  stripDone: { backgroundColor: theme.sun },
  stripToday: { backgroundColor: theme.sunTint, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.sun },
  stripMark: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 14 },
});
