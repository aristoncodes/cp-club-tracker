import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { timeAgo } from 'shared/time';
import { theme } from '../theme';
import { api } from './api';
import { Avatar, Rating } from './ui';

type FeedItem = {
  kind: 'solve' | 'duel';
  id?: number;
  text?: string;
  userId: number;
  name: string;
  username: string | null;
  platform: string;
  problemId: string;
  problemName: string | null;
  url: string | null;
  tags: string[];
  rp: number;
  points: number;
  solvedAt: number;
};

const PAGE_SIZE = 30;

const REFRESH_MS = 60_000;

export function FeedPanel() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const page = await api<FeedItem[]>('/feed');
      setItems(page);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the feed.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const addNewest = useCallback(async () => {
    const page = await api<FeedItem[]>('/feed').catch(() => []);
    setItems((current) => [...page.filter((item) => item.solvedAt > (current[0]?.solvedAt ?? 0)), ...current]);
  }, []);

  async function loadMore() {
    if (!hasMore || !items.length) return;
    setHasMore(false);
    try {
      const page = await api<FeedItem[]>(`/feed?before=${items[items.length - 1].solvedAt}`);
      setItems((current) => [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more.');
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(addNewest, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load, addNewest]),
  );

  const now = Date.now() / 1000;
  return (
    <View style={styles.panel}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => (item.kind === 'duel' ? `duel-${item.id}` : `${item.userId}-${item.platform}-${item.problemId}`)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.lime} />}
        onEndReached={loadMore}
        ListEmptyComponent={refreshing ? undefined : <Text style={styles.muted}>No solves yet. Be the first on the board.</Text>}
        renderItem={({ item }) => item.kind === 'duel' ? (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: '/duel/[id]', params: { id: String(item.id) } })}>
            <View style={styles.main}>
              <Text style={styles.line}>{item.text}</Text>
              <Text style={styles.small}>{timeAgo(item.solvedAt, now)}</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable style={styles.row} onPress={() => item.url && Linking.openURL(item.url)}>
            <Avatar userId={item.userId} name={item.name} />
            <View style={styles.main}>
              <Text style={styles.line}>
                <Text style={styles.name} onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(item.userId) } })}>
                  {item.name.split(' ')[0]}
                </Text>{item.username ? <Text style={styles.small}> @{item.username}</Text> : null}{' '}
                solved {item.problemName ?? item.problemId}
              </Text>
              <Text style={styles.small} numberOfLines={1}>{[...item.tags.slice(0, 3), timeAgo(item.solvedAt, now)].join(' · ')}</Text>
            </View>
            <View style={styles.chip}><Rating value={item.rp} /></View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, gap: 12 },
  error: { color: theme.pink, fontFamily: theme.font.regular, fontSize: 14 },
  list: { gap: 6, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  main: { flex: 1, gap: 2 },
  line: { color: theme.text, fontFamily: theme.font.regular, fontSize: 14 },
  name: { color: theme.text, fontFamily: theme.font.bold, fontSize: 14 },
  muted: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14 },
  small: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 12 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.card2 },
});
