import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatIST } from 'shared/time';
import { ApiError, api, clearSession, getSession, type Me } from '../../lib/api';
import { registerPushToken } from '../../lib/push';
import { Button } from '../../lib/ui';
import { theme } from '../../theme';

type Contest = { id: number; platform: string; name: string; url: string; startAt: number; rsvp: string | null };
type Destination = 'login' | 'onboarding' | null;

const PLATFORM_LABELS: Record<string, string> = { cf: 'Codeforces', cc: 'CodeChef' };

function countdown(startAt: number): string {
  const minutes = Math.max(0, Math.floor((startAt - Date.now() / 1000) / 60));
  const days = Math.floor(minutes / 1440);
  if (days) return `in ${days}d ${Math.floor((minutes % 1440) / 60)}h`;
  return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function shortTime(startAt: number): string {
  const [date, time] = formatIST(startAt).split(' · ');
  return `${date.split(',')[0]} ${time}`;
}

function rsvpLabel(rsvp: string | null): string {
  if (rsvp === 'yes') return "You said you're going";
  if (rsvp === 'no') return "You said you can't make it";
  return 'We will ask 5 minutes before it starts';
}

function ContestCard({ contest }: { contest: Contest }) {
  return (
    <View style={styles.card}>
      <Text style={styles.tag}>{(PLATFORM_LABELS[contest.platform] ?? contest.platform).toUpperCase()}</Text>
      <Text style={styles.contestName}>{contest.name}</Text>
      <Text style={styles.time}>
        {shortTime(contest.startAt)} · {countdown(contest.startAt)}
      </Text>
      <Text style={styles.muted}>{rsvpLabel(contest.rsvp)}</Text>
    </View>
  );
}

function needsOnboarding({ user, handles }: Me): boolean {
  const approved = (platform: string) => handles.some((h) => h.platform === platform && h.approved);
  return !user.batchYear || !approved('cf') || !approved('cc');
}

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [destination, setDestination] = useState<Destination>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    if (!(await getSession())) return setDestination('login');
    try {
      const [meData, upcoming] = await Promise.all([api<Me>('/me'), api<Contest[]>('/contests/upcoming')]);
      registerPushToken().catch(console.warn);
      if (needsOnboarding(meData)) return setDestination('onboarding');
      setMe(meData);
      setContests(upcoming);
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

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {me.pendingReasons.map((contest) => (
        <Pressable
          key={contest.id}
          accessibilityRole="button"
          style={styles.banner}
          onPress={() => router.push({ pathname: '/reason', params: { contestId: String(contest.id) } })}
        >
          <Text style={styles.bannerText}>Give a reason for {contest.name}</Text>
        </Pressable>
      ))}
      {contests[0] ? (
        <ContestCard contest={contests[0]} />
      ) : (
        <Text style={styles.muted}>No contests coming up yet. Check back soon.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 64, gap: 16 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, gap: 16 },
  card: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  tag: { color: theme.muted, fontFamily: theme.font.medium, fontSize: 12, letterSpacing: 0.48 },
  contestName: { color: theme.text, fontFamily: theme.font.semibold, fontSize: 18 },
  time: { color: theme.text, fontFamily: theme.font.mono, fontSize: 14 },
  muted: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14 },
  banner: { backgroundColor: theme.pendingTint, borderRadius: 8, padding: 12, minHeight: 44, justifyContent: 'center' },
  bannerText: { color: theme.pending, fontFamily: theme.font.medium, fontSize: 14 },
  error: { color: theme.absent, fontFamily: theme.font.regular, fontSize: 14 },
});
