import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type Me } from '../lib/api';
import { Button } from '../lib/ui';
import { theme } from '../theme';

const PLATFORMS = [
  { id: 'cf', label: 'Codeforces', required: true },
  { id: 'cc', label: 'CodeChef', required: true },
  { id: 'leetcode', label: 'LeetCode', required: false },
  { id: 'atcoder', label: 'AtCoder', required: false },
];

export default function Onboarding() {
  const [me, setMe] = useState<Me | null>(null);
  const [batchYear, setBatchYear] = useState('');
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<Me>('/me')
        .then((data) => {
          setMe(data);
          setBatchYear(data.user.batchYear ? String(data.user.batchYear) : '');
          setHandles(Object.fromEntries(data.handles.map((h) => [h.platform, h.handle])));
        })
        .catch((err) => setError(err.message));
    }, []),
  );

  async function save() {
    if (!me) return;
    const year = Number(batchYear);
    if (!Number.isInteger(year) || batchYear.length !== 4) return setError('Enter your 4-digit batch year.');
    if (PLATFORMS.some((p) => p.required && !handles[p.id]?.trim())) {
      return setError('Codeforces and CodeChef handles are required.');
    }
    setError('');
    setSaving(true);
    try {
      await api('/me', 'PUT', { name: me.user.name, batchYear: year });
      for (const { id } of PLATFORMS) {
        if (handles[id]?.trim()) await api(`/me/handles/${id}`, 'PUT', { handle: handles[id] });
      }
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const statusFor = (platform: string) => me?.handles.find((h) => h.platform === platform);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Set up your profile</Text>
      <View style={styles.field}>
        <Text style={styles.label}>BATCH YEAR</Text>
        <TextInput
          style={styles.input}
          value={batchYear}
          onChangeText={setBatchYear}
          keyboardType="number-pad"
          placeholder="2027"
          placeholderTextColor={theme.muted}
          maxLength={4}
        />
      </View>
      {PLATFORMS.map(({ id, label, required }) => {
        const status = statusFor(id);
        return (
          <View key={id} style={styles.field}>
            <Text style={styles.label}>{`${label}${required ? '' : ' (optional)'}`.toUpperCase()}</Text>
            <TextInput
              style={styles.input}
              value={handles[id] ?? ''}
              onChangeText={(value) => setHandles((current) => ({ ...current, [id]: value }))}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {status && !status.approved ? <Text style={styles.waiting}>Waiting for admin approval</Text> : null}
          </View>
        );
      })}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Save" onPress={save} disabled={saving || !me} />
      <Button title="Check approval" variant="secondary" onPress={() => router.replace('/')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 64, gap: 16 },
  title: { color: theme.text, fontFamily: theme.font.bold, fontSize: 24 },
  field: { gap: 4 },
  label: { color: theme.muted, fontFamily: theme.font.medium, fontSize: 12, letterSpacing: 0.48 },
  input: {
    color: theme.text,
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    fontFamily: theme.font.mono,
    fontSize: 14,
  },
  waiting: { color: theme.pending, fontFamily: theme.font.regular, fontSize: 12 },
  error: { color: theme.absent, fontFamily: theme.font.regular, fontSize: 14 },
});
