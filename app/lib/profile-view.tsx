import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { heatmapWeeks } from 'shared/time';
import { theme } from '../theme';
import { api } from './api';
import { Rating } from './ui';

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
const HEAT_OPACITY = [0, 0.25, 0.5, 0.75, 1];
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
      <Text style={styles.title}>{profile.name}</Text>
      <Text style={styles.muted}>
        {profile.batchYear ? `Batch ${profile.batchYear} · ` : ''}CF rating <Rating value={profile.cfRating} />
      </Text>
      <View style={styles.grid}>
        <Stat label="TODAY" value={round(profile.stats.dayPoints)} />
        <Stat label="THIS WEEK" value={round(profile.stats.weekPoints)} />
        <Stat label="THIS MONTH" value={round(profile.stats.monthPoints)} />
        <Stat label="STREAK" value={profile.streak} />
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
  page: { padding: 16, paddingTop: 64, gap: 12 },
  title: { color: theme.text, fontFamily: theme.font.bold, fontSize: 24 },
  heading: { color: theme.text, fontFamily: theme.font.semibold, fontSize: 18 },
  label: { color: theme.muted, fontFamily: theme.font.medium, fontSize: 12, letterSpacing: 0.48 },
  text: { color: theme.text, fontFamily: theme.font.regular, fontSize: 14 },
  muted: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14 },
  count: { color: theme.muted, fontFamily: theme.font.mono, fontSize: 14 },
  error: { color: theme.absent, fontFamily: theme.font.regular, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  stat: { flexGrow: 1, flexBasis: '40%' },
  bigStat: { color: theme.text, fontFamily: theme.font.monoBold, fontSize: 32 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  heatmap: { flexDirection: 'row', gap: 2 },
  heatWeek: { gap: 2 },
  heatBlank: { width: 10, height: 10 },
  heatDay: { width: 10, height: 10, borderRadius: 2, backgroundColor: theme.surface2, overflow: 'hidden' },
  heatFill: { flex: 1, backgroundColor: theme.accent },
});
