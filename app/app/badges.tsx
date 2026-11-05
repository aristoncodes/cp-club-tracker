import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BADGES, type BadgeId } from 'shared/badges';
import { formatIST } from 'shared/time';
import { api } from '../lib/api';
import { BadgeTile } from '../lib/badge-tile';
import { common, ProgressBar, ScreenHeader } from '../lib/ui';
import { theme } from '../theme';

type BadgeRow = { id: BadgeId; goal: number; value: number; earnedAt: number | null };

export default function Badges() {
  const { user } = useLocalSearchParams<{ user?: string }>();
  const [rows, setRows] = useState<BadgeRow[] | null>(null);
  const [error, setError] = useState('');
  const [extra, setExtra] = useState<{ id: string; label: string; earnedAt: number }[]>([]);

  useFocusEffect(
    useCallback(() => {
      api<BadgeRow[]>(`/badges${user ? `?user=${user}` : ''}`).then(setRows).catch((err) => setError(err.message));
      api<typeof extra>(`/badges/extra${user ? `?user=${user}` : ''}`).then(setExtra).catch(console.warn);
    }, [user]),
  );

  const earned = rows?.filter((row) => row.earnedAt).length ?? 0;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader title="Badges" />
      <Text style={common.muted}>{earned} of {BADGES.length} earned</Text>
      {error ? <Text style={common.error}>{error}</Text> : null}
      <View style={styles.grid}>
        {extra.map((badge) => (
          <View key={badge.id} style={[common.card, styles.tile]}>
            <Text style={common.bold}>★ {badge.label}</Text>
            <Text style={styles.date}>{formatIST(badge.earnedAt).split(', ')[1].split(' · ')[0]}</Text>
          </View>
        ))}
        {rows?.map((row) => {
          const badge = BADGES.find((b) => b.id === row.id)!;
          return (
            <View key={row.id} style={[common.card, styles.tile]}>
              <BadgeTile id={row.id} earned={!!row.earnedAt} />
              <Text style={common.bold}>{badge.name}</Text>
              <Text style={common.small}>{badge.how}</Text>
              {row.earnedAt ? <Text style={styles.date}>{formatIST(row.earnedAt).split(', ')[1].split(' · ')[0]}</Text> : null}
              {!row.earnedAt && badge.stat ? (
                <>
                  <ProgressBar percent={(row.value / row.goal) * 100} />
                  <Text style={common.small}>{row.value} of {row.goal}</Text>
                </>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 48, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', gap: 6 },
  date: { color: theme.lime, fontFamily: theme.font.monoBold, fontSize: 12 },
});
