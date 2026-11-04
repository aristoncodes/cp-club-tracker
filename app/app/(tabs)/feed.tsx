import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { timeAgo } from 'shared/time';
import { api } from '../../lib/api';
import { Rating } from '../../lib/ui';
import { theme } from '../../theme';

type FeedItem = {
  userId: number;
  name: string;
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

export default function Feed() {
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
    }, [load]),
  );

  const now = Date.now() / 1000;
  return (
    <View style={styles.page}>
      <Text style={styles.title}>Feed</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.userId}-${item.platform}-${item.problemId}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.accent} />}
        onEndReached={loadMore}
        ListEmptyComponent={refreshing ? undefined : <Text style={styles.muted}>No solves yet. Be the first on the board.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => item.url && Linking.openURL(item.url)}>
            <View style={styles.main}>
              <Text style={styles.line}>
                <Text style={styles.name} onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(item.userId) } })}>
                  {item.name}
                </Text>{' '}
                <Text style={styles.muted}>solved</Text> <Rating value={item.rp} />
              </Text>
              <Text style={styles.line} numberOfLines={1}>{item.problemName ?? item.problemId}</Text>
              <Text style={styles.small} numberOfLines={1}>{[...item.tags.slice(0, 3), timeAgo(item.solvedAt, now)].join(' · ')}</Text>
            </View>
            <Text style={styles.points}>+{item.points}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 64, paddingHorizontal: 16, gap: 12 },
  title: { color: theme.text, fontFamily: theme.font.bold, fontSize: 24 },
  error: { color: theme.absent, fontFamily: theme.font.regular, fontSize: 14 },
  row: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  main: { flex: 1, gap: 2 },
  line: { color: theme.text, fontFamily: theme.font.regular, fontSize: 14 },
  name: { color: theme.text, fontFamily: theme.font.medium, fontSize: 14 },
  muted: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14 },
  small: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 12 },
  points: { color: theme.accent, fontFamily: theme.font.mono, fontSize: 14 },
});
