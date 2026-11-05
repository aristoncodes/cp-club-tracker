import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { batchForStudyYear, STUDY_YEARS, studyYearOf } from 'shared/batch';
import { api, getSession, type Me } from '../lib/api';
import { Button, common, platformColor, PLATFORM_NAMES } from '../lib/ui';
import { theme } from '../theme';

const REQUIRED = ['cf', 'cc'];
const OPTIONAL = ['leetcode', 'atcoder'];

export default function Signup() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [check, setCheck] = useState<{ available: boolean; error?: string } | null>(null);
  const [year, setYear] = useState(0);
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSession().then(async (token) => {
      setSignedIn(!!token);
      if (token) {
        try {
          const data = await api<Me>('/me');
          setMe(data);
          setName(data.user.name);
          setUsername(data.user.username ?? '');
          setYear(data.user.batchYear ? studyYearOf(data.user.batchYear, Date.now() / 1000) : 0);
          setHandles(Object.fromEntries(data.handles.map((h) => [h.platform, h.handle])));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load. Please try again.');
        }
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!username || username === me?.user.username) return setCheck(username ? { available: true } : null);
    const timer = setTimeout(() => {
      api<{ available: boolean; error?: string }>(`/auth/username-available?u=${encodeURIComponent(username)}`).then(setCheck).catch(() => setCheck(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [username, me?.user.username]);

  if (!ready) return null;
  if (!signedIn) return <Redirect href="/login" />;
  const isAdmin = me?.user.role === 'admin';
  const missing = !isAdmin && REQUIRED.some((id) => !handles[id]?.trim());

  async function submit() {
    setError('');
    setSaving(true);
    try {
      await api('/me', 'PUT', { name, username, batchYear: batchForStudyYear(year, Date.now() / 1000) });
      for (const id of [...REQUIRED, ...OPTIONAL]) {
        if (handles[id]?.trim()) await api(`/me/handles/${id}`, 'PUT', { handle: handles[id] });
      }
      await api('/me/onboarding', 'POST');
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Welcome to the club</Text>
      <View style={styles.field}>
        <Text style={common.label}>DISPLAY NAME</Text>
        <TextInput style={common.input} value={name} onChangeText={setName} autoComplete="name" />
      </View>
      <View style={styles.field}>
        <Text style={common.label}>USERNAME</Text>
        <View style={[common.input, common.row, check?.available && { borderColor: theme.limeLine }]}>
          <Text style={[common.muted, common.mono]}>@</Text>
          <TextInput style={styles.usernameInput} value={username} onChangeText={(value) => setUsername(value.trim().toLowerCase())} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Username" />
          {check?.available ? <Text style={common.link}>✓ free</Text> : null}
        </View>
        {check && !check.available ? <Text style={[common.small, { color: theme.pink }]}>{check.error ?? 'taken'}</Text> : null}
        <Text style={common.small}>You can change it once later.</Text>
      </View>
      <View style={styles.field}>
        <Text style={common.label}>YEAR</Text>
        <View style={styles.years}>
          {STUDY_YEARS.map((option) => (
            <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: year === option.value }} onPress={() => setYear(option.value)} style={[styles.year, year === option.value && styles.yearOn]}>
              <Text style={[styles.yearText, year === option.value && styles.yearTextOn]}>{option.label.replace(' year', '')}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {[...REQUIRED, ...OPTIONAL].map((id) => (
        <View key={id} style={styles.field}>
          <Text style={[common.label, { color: platformColor(id) }]}>{PLATFORM_NAMES[id].toUpperCase()}{REQUIRED.includes(id) && !isAdmin ? '' : ' (OPTIONAL)'}</Text>
          <TextInput style={[common.input, common.mono]} value={handles[id] ?? ''} onChangeText={(value) => setHandles((current) => ({ ...current, [id]: value }))} autoCapitalize="none" autoCorrect={false} />
        </View>
      ))}
      {error ? <Text style={common.error}>{error}</Text> : null}
      <Button title="Continue" disabled={saving || !name.trim() || !year || !check?.available || missing} onPress={submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: theme.gutter, paddingTop: 56, gap: 14 },
  title: { color: theme.text, fontFamily: theme.font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.9 },
  field: { gap: 6 },
  usernameInput: { flex: 1, color: theme.text, fontFamily: theme.font.monoBold, fontSize: 16, height: 48 },
  years: { flexDirection: 'row', gap: 8 },
  year: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  yearOn: { backgroundColor: theme.lime, borderColor: theme.lime },
  yearText: { color: theme.text, fontFamily: theme.font.bold, fontSize: 14 },
  yearTextOn: { color: theme.ink },
});
