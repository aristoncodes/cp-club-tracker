import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { studyYearLabel } from 'shared/batch';
import { timeAgo } from 'shared/time';
import { api, type Announcement } from '../lib/api';
import { common, openLink, Pill, ScreenHeader } from '../lib/ui';
import { theme } from '../theme';

function audienceLabel(item: Announcement): string {
  if (item.audience === 'admins') return 'Admins';
  if (item.audience === 'batch') return studyYearLabel(item.batchYear, Date.now() / 1000) || 'One year';
  return 'Everyone';
}

export default function Announcements() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      api<{ items: Announcement[] }>('/announcements')
        .then((inbox) => {
          setItems(inbox.items);
          return api('/announcements/seen', 'POST');
        })
        .catch((err) => setError(err.message));
    }, []),
  );

  const now = Date.now() / 1000;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader title="Announcements" />
      {error ? <Text style={common.error}>{error}</Text> : null}
      {items?.length === 0 ? <Text style={common.muted}>Nothing here yet. Club news shows up here.</Text> : null}
      {items?.map((item) => (
        <Pressable key={item.id} disabled={!item.link} onPress={() => item.link && openLink(item.link)} style={[common.card, item.unread ? styles.unread : null]}>
          <View style={common.between}>
            <Text style={common.small}>{item.authorName} · {timeAgo(item.sentAt, now)}</Text>
            {item.unread ? <View style={styles.dot} accessibilityLabel="Unread" /> : null}
          </View>
          <Text style={common.bold}>{item.title}</Text>
          <Text style={common.muted}>{item.body}</Text>
          <View style={common.row}><Pill tone="muted" label={audienceLabel(item)} /></View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 48, gap: 10 },
  unread: { backgroundColor: '#1F1F29' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.pink },
});
