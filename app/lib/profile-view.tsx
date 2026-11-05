import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { studyYearLabel } from 'shared/batch';
import { ratingColor } from 'shared/rating-color';
import { contestResult, type ContestOutcome } from 'shared/reasons';
import { formatIST, heatmapWeeks, solvesText } from 'shared/time';
import { theme } from '../theme';
import { api } from './api';
import { Avatar, CellMark, common, platformColor, Rating, ScreenHeader } from './ui';

type RatingPoint = { rating: number };
type UserProfile = {
  id: number;
  name: string;
  username: string | null;
  batchYear: number | null;
  cfRating: number | null;
  ratingHistory: RatingPoint[];
  handles: { platform: string; handle: string; approved: number }[];
  stats: { monthPoints: number; monthSolves: number; totalSolves: number };
  streak: number;
  topTags: { tag: string; count: number }[];
  heatmap: { day: number; count: number }[];
  today: number;
  attendance?: { total: number; present: number };
  contests?: (ContestOutcome & { id: number; name: string; startAt: number })[];
};

const CODES: Record<string, string> = { cf: 'CF', cc: 'CC', atcoder: 'AC', leetcode: 'LC' };
const HEAT_OPACITY = [0, 0.25, 0.5, 0.75, 1];
const HEAT_WEEKS = 21;
const WEEKDAY_LABELS = ['M', '', 'W', '', 'F', '', ''];
const TOPIC_COLORS = [theme.lime, theme.pink, theme.sun, theme.sky];
const TOP_TOPICS = 4;
const RECENT_CONTESTS = 4;
const RANK_EDGES = [1200, 1400, 1600, 1900, 2100, 2400];
const CHART_W = 320;
const CHART_H = 150;
const CHART_PAD = 8;
const round = (points: number) => Math.round(points * 10) / 10;

function RatingChart({ history }: { history: RatingPoint[] }) {
  if (history.length < 2) return <Text style={common.muted}>The chart appears after two rated contests.</Text>;
  const ratings = history.map((p) => p.rating);
  const low = Math.min(...ratings) - 100;
  const high = Math.max(...ratings) + 100;
  const x = (index: number) => CHART_PAD + (index / (history.length - 1)) * (CHART_W - CHART_PAD * 2);
  const y = (rating: number) => CHART_H - CHART_PAD - ((rating - low) / (high - low)) * (CHART_H - CHART_PAD * 2);
  const clamp = (rating: number) => Math.max(0, Math.min(CHART_H, y(rating)));
  const bands = [0, ...RANK_EDGES].map((from, index) => ({ from, to: RANK_EDGES[index] ?? 5000 })).filter((b) => b.to > low && b.from < high);
  const last = history[history.length - 1];
  return (
    <View accessibilityRole="image" accessibilityLabel={`Codeforces rating went from ${history[0].rating} to ${last.rating} over ${history.length} contests`}>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        {bands.map((band) => <Rect key={band.from} x={0} width={CHART_W} y={clamp(band.to)} height={clamp(band.from) - clamp(band.to)} fill={ratingColor(band.from)} opacity={0.06} />)}
        <Polyline fill="none" stroke={theme.lime} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" points={history.map((p, i) => `${x(i)},${y(p.rating)}`).join(' ')} />
        <Circle cx={x(history.length - 1)} cy={y(last.rating)} r={5} fill={theme.lime} />
      </Svg>
    </View>
  );
}

function Tile({ label, children, detail, filled }: { label: string; children: React.ReactNode; detail: string; filled?: boolean }) {
  const color = filled ? theme.ink : theme.text;
  return (
    <View style={[common.card, styles.tile, filled && styles.tileFilled]}>
      <Text style={[common.small, styles.tileLabel, { color: filled ? theme.ink : theme.muted }]}>{label}</Text>
      <Text style={[styles.bigStat, { color }]}>{children}</Text>
      <Text style={[common.small, { color: filled ? theme.ink : theme.muted }]}>{detail}</Text>
    </View>
  );
}

export function ProfileView({ id, own }: { id: number; own?: boolean }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      setError('');
      api<UserProfile>(`/users/${id}`)
        .then(setProfile)
        .catch((err) => setError(err.message));
    }, [id]),
  );

  if (error) return <Text style={[common.error, styles.page]}>{error}</Text>;
  if (!profile) return null;
  const year = studyYearLabel(profile.batchYear, Date.now() / 1000);
  const total = profile.heatmap.reduce((sum, d) => sum + d.count, 0);
  const topCount = Math.max(1, ...profile.topTags.map((t) => t.count));
  const { attendance, contests } = profile;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader
        title="Profile"
        centred
        right={own ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} onPress={() => router.push('/settings')}>
            <Feather name="settings" size={22} color={theme.text} />
          </Pressable>
        ) : undefined}
      />
      <View style={styles.header}>
        <Avatar userId={profile.id} name={profile.name} size={80} />
        <Text style={styles.name}>{profile.name}</Text>
        {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
        <View style={styles.chips}>
          {year ? <View style={styles.chip}><Text style={common.small}>{year}</Text></View> : null}
          {profile.handles.map((h) => (
            <View key={h.platform} style={styles.chip}>
              <Text style={[styles.chipCode, { color: platformColor(h.platform) }]}>{CODES[h.platform]} </Text>
              {h.platform === 'cf' ? <Rating value={profile.cfRating}>{h.handle}{profile.cfRating ? ` · ${profile.cfRating}` : ''}</Rating> : <Text style={styles.chipHandle}>{h.handle}</Text>}
              {h.approved ? null : <Text style={common.small}> pending</Text>}
            </View>
          ))}
        </View>
      </View>
      <View style={styles.grid}>
        <Tile label="This month" detail={solvesText(profile.stats.monthSolves)} filled>{round(profile.stats.monthPoints)}</Tile>
        <Tile label="Streak" detail="days"><Text style={{ color: theme.sun }}>{profile.streak}</Text></Tile>
        <Tile label="Solves" detail="Total">{profile.stats.totalSolves}</Tile>
        {attendance ? <Tile label="Attendance" detail={`${attendance.present}/${attendance.total} contests`}>{attendance.total ? `${Math.round((attendance.present / attendance.total) * 100)}%` : '—'}</Tile> : null}
      </View>
      <View style={common.card}>
        <Text style={common.heading}>Activity</Text>
        <View>
          <View style={[styles.heatmap, total === 0 && styles.dimmed]} accessibilityLabel={`${solvesText(total)} in the last 6 months`}>
            <View style={styles.heatWeek}>
              {WEEKDAY_LABELS.map((label, index) => <Text key={index} style={styles.heatLabel}>{label}</Text>)}
            </View>
            {heatmapWeeks(profile.heatmap, profile.today, HEAT_WEEKS).map((week, weekIndex) => (
              <View key={weekIndex} style={styles.heatWeek}>
                {week.map((step, dayIndex) =>
                  step === null ? (
                    <View key={dayIndex} style={styles.heatBlank} />
                  ) : (
                    <View key={dayIndex} style={styles.heatDay}>
                      <View style={[styles.heatFill, { opacity: HEAT_OPACITY[step] }]} />
                    </View>
                  ),
                )}
              </View>
            ))}
          </View>
          {total === 0 ? <View style={styles.emptyOverlay}><Text style={common.bold}>{own ? 'No activity yet. Your first accepted solution will appear here.' : 'Nothing here yet.'}</Text></View> : null}
        </View>
        <View style={common.between}>
          <Text style={common.small}>{solvesText(total)} in 6 months</Text>
          <View style={styles.legend}>
            <Text style={common.small}>Less</Text>
            {HEAT_OPACITY.map((opacity) => <View key={opacity} style={styles.heatDay}><View style={[styles.heatFill, { opacity }]} /></View>)}
            <Text style={common.small}>More</Text>
          </View>
        </View>
      </View>
      <View style={common.card}>
        <View style={common.between}>
          <Text style={common.heading}>CF rating</Text>
          <Rating value={profile.cfRating} />
        </View>
        <RatingChart history={profile.ratingHistory} />
      </View>
      <View style={common.card}>
        <Text style={common.heading}>Top topics</Text>
        {profile.topTags.length === 0 ? <Text style={common.muted}>Topics will appear after a few solves.</Text> : null}
        {profile.topTags.slice(0, TOP_TOPICS).map((t, index) => (
          <View key={t.tag} style={styles.topic}>
            <View style={common.between}><Text style={common.text}>{t.tag}</Text><Text style={styles.count}>{t.count}</Text></View>
            <View style={styles.topicTrack}><View style={[styles.topicFill, { width: `${(t.count / topCount) * 100}%`, backgroundColor: TOPIC_COLORS[index % TOPIC_COLORS.length] }]} /></View>
          </View>
        ))}
      </View>
      {contests ? (
        <View style={common.card}>
          <Text style={common.heading}>Recent contests</Text>
          {contests.length === 0 ? <Text style={common.muted}>No counted contests yet.</Text> : null}
          {contests.slice(0, RECENT_CONTESTS).map((contest) => (
            <View key={contest.id} style={common.row}>
              <CellMark status={contest.status} reasonType={contest.reasonType} />
              <View style={styles.flex}>
                <Text style={common.bold} numberOfLines={1}>{contest.name}</Text>
                <Text style={common.small}>{formatIST(contest.startAt).split(' · ')[0]} · {contestResult(contest)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 48, gap: 12 },
  flex: { flex: 1 },
  header: { alignItems: 'center', gap: 4 },
  name: { color: theme.text, fontFamily: theme.font.display, fontSize: 28, letterSpacing: -0.8, textAlign: 'center' },
  username: { color: theme.lime, fontFamily: theme.font.monoBold, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.card2 },
  chipCode: { fontFamily: theme.font.monoBold, fontSize: 12 },
  chipHandle: { color: theme.text, fontFamily: theme.font.monoBold, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '40%', gap: 2 },
  tileFilled: { backgroundColor: theme.lime, borderColor: theme.lime },
  tileLabel: { fontFamily: theme.font.bold },
  bigStat: { fontFamily: theme.font.monoHeavy, fontSize: 32, letterSpacing: -1 },
  count: { color: theme.muted, fontFamily: theme.font.monoHeavy, fontSize: 13 },
  heatmap: { flexDirection: 'row', gap: 2, justifyContent: 'space-between' },
  dimmed: { opacity: 0.3 },
  heatWeek: { gap: 2 },
  heatLabel: { width: 11, height: 11, lineHeight: 11, color: theme.muted, fontFamily: theme.font.regular, fontSize: 9 },
  heatBlank: { width: 11, height: 11 },
  heatDay: { width: 11, height: 11, borderRadius: 3, backgroundColor: theme.card3, overflow: 'hidden' },
  heatFill: { flex: 1, backgroundColor: theme.lime },
  emptyOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  topic: { gap: 4 },
  topicTrack: { height: 8, borderRadius: 4, backgroundColor: theme.card2, overflow: 'hidden' },
  topicFill: { height: '100%', borderRadius: 4 },
});
