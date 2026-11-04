import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { studyYearLabel } from 'shared/batch';
import { heatmapWeeks } from 'shared/time';
import { theme } from '../theme';
import { api } from './api';
import { Avatar, Rating } from './ui';

type UserProfile = {
  name: string;
  batchYear: number | null;
  cfRating: number | null;
  handles: { platform: string; handle: string }[];
  stats: Record<'dayPoints' | 'weekPoints' | 'monthPoints', number>;
  streak: number;
  topTags: { tag: string; count: number }[];
  heatmap: { day: number; count: number }[];
  today: number;
};

const PLATFORM_LABELS: Record<string, string> = { cf: 'Codeforces', cc: 'CodeChef', leetcode: 'LeetCode', atcoder: 'AtCoder' };
const HEAT_OPACITY = [0, 0.3, 0.55, 0.8, 1];
const round = (points: number) => Math.round(points * 10) / 10;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={[styles.card, styles.stat]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.bigStat}>{value}</Text>
    </View>
  );
}

export function ProfileView({ id, footer }: { id: number; footer?: ReactNode }) {
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

  if (error) return <Text style={[styles.error, styles.page]}>{error}</Text>;
  if (!profile) return null;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Avatar userId={id} name={profile.name} size={56} />
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{profile.name}</Text>
          <Text style={styles.muted}>
            {[studyYearLabel(profile.batchYear, Date.now() / 1000), 'CF rating'].filter(Boolean).join(' · ')} <Rating value={profile.cfRating} />
          </Text>
        </View>
      </View>
      <View style={styles.grid}>
        <Stat label="Today" value={round(profile.stats.dayPoints)} />
        <Stat label="This week" value={round(profile.stats.weekPoints)} />
        <Stat label="This month" value={round(profile.stats.monthPoints)} />
        <Stat label="Streak" value={profile.streak} />
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Last 6 months</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Solves per day for the last 26 weeks">
          <View style={styles.heatmap}>
            {heatmapWeeks(profile.heatmap, profile.today).map((week, weekIndex) => (
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
        </ScrollView>
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Handles</Text>
        {profile.handles.length === 0 ? <Text style={styles.muted}>No approved handles yet.</Text> : null}
        {profile.handles.map((h) => (
          <View key={h.platform} style={styles.line}>
            <Text style={styles.muted}>{PLATFORM_LABELS[h.platform] ?? h.platform}</Text>
            <Rating value={h.platform === 'cf' ? profile.cfRating : null}>{h.handle}</Rating>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Top tags</Text>
        {profile.topTags.length === 0 ? <Text style={styles.muted}>Tags show up after a few solves.</Text> : null}
        {profile.topTags.map((t) => (
          <View key={t.tag} style={styles.line}>
            <Text style={styles.text}>{t.tag}</Text>
            <Text style={styles.count}>{t.count}</Text>
          </View>
        ))}
      </View>
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 56, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  title: { color: theme.text, fontFamily: theme.font.display, fontSize: 28, letterSpacing: -0.8 },
  heading: { color: theme.text, fontFamily: theme.font.display, fontSize: 18, letterSpacing: -0.3 },
  label: { color: theme.muted, fontFamily: theme.font.bold, fontSize: 12 },
  text: { color: theme.text, fontFamily: theme.font.regular, fontSize: 14 },
  muted: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14 },
  count: { color: theme.muted, fontFamily: theme.font.monoHeavy, fontSize: 14 },
  error: { color: theme.pink, fontFamily: theme.font.regular, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1, borderRadius: 20, padding: 18, gap: 8 },
  stat: { flexGrow: 1, flexBasis: '40%' },
  bigStat: { color: theme.lime, fontFamily: theme.font.monoHeavy, fontSize: 32, letterSpacing: -1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  heatmap: { flexDirection: 'row', gap: 2 },
  heatWeek: { gap: 2 },
  heatBlank: { width: 10, height: 10 },
  heatDay: { width: 10, height: 10, borderRadius: 3, backgroundColor: theme.card2, overflow: 'hidden' },
  heatFill: { flex: 1, backgroundColor: theme.lime },
});
