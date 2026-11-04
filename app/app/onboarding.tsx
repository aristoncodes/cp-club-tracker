import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { batchForStudyYear, STUDY_YEARS, studyYearOf } from 'shared/batch';
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
  const [studyYear, setStudyYear] = useState(0);
  const [yearsOpen, setYearsOpen] = useState(false);
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<Me>('/me')
        .then((data) => {
          setMe(data);
          setStudyYear(data.user.batchYear ? studyYearOf(data.user.batchYear, Date.now() / 1000) : 0);
          setHandles(Object.fromEntries(data.handles.map((h) => [h.platform, h.handle])));
        })
        .catch((err) => setError(err.message));
    }, []),
  );

  async function save() {
    if (!me) return;
    if (!STUDY_YEARS.some((y) => y.value === studyYear)) return setError('Choose your year.');
    if (PLATFORMS.some((p) => p.required && !handles[p.id]?.trim())) {
      return setError('Codeforces and CodeChef handles are required.');
    }
    setError('');
    setSaving(true);
    try {
      await api('/me', 'PUT', { name: me.user.name, batchYear: batchForStudyYear(studyYear, Date.now() / 1000) });
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
        <Text style={styles.label}>YEAR</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: yearsOpen }}
          onPress={() => setYearsOpen((open) => !open)}
          style={styles.dropdown}
        >
          <Text style={studyYear ? styles.yearText : styles.yearPlaceholder}>
            {STUDY_YEARS.find((y) => y.value === studyYear)?.label ?? 'Choose your year'}
          </Text>
          <Text style={styles.yearPlaceholder}>{yearsOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {yearsOpen ? (
          <View style={styles.dropdownList}>
            {STUDY_YEARS.map((y) => (
              <Pressable
                key={y.value}
                accessibilityRole="button"
                onPress={() => {
                  setStudyYear(y.value);
                  setYearsOpen(false);
                }}
                style={styles.dropdownItem}
              >
                <Text style={[styles.yearText, y.value === studyYear && styles.yearTextSelected]}>{y.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
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
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
  },
  dropdownList: { borderRadius: 8, backgroundColor: theme.surface2, borderColor: theme.border, borderWidth: 1 },
  dropdownItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  yearPlaceholder: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14 },
  yearText: { color: theme.text, fontFamily: theme.font.regular, fontSize: 14 },
  yearTextSelected: { color: theme.accent },
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
