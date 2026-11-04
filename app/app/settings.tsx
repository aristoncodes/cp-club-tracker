import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { batchForStudyYear, STUDY_YEARS, studyYearOf } from 'shared/batch';
import { api, clearSession, setSession, type Me } from '../lib/api';
import { useGoogleSignIn } from '../lib/google';
import { Button, common, Pill, platformColor, PLATFORM_NAMES, ScreenHeader, Toggle } from '../lib/ui';
import { theme } from '../theme';

const PLATFORMS = [
  { id: 'cf', required: true, code: 'CF' },
  { id: 'cc', required: true, code: 'CC' },
  { id: 'leetcode', required: false, code: 'LC' },
  { id: 'atcoder', required: false, code: 'AC' },
];
const SWITCHES = [
  { key: 'notifyHour', title: '1 hour before', detail: 'A reminder before each counted contest.' },
  { key: 'notifyRsvp', title: '5 min RSVP', detail: 'Tell us if you are giving it.' },
  { key: 'notifyResult', title: 'After contest', detail: 'Your attendance result.' },
  { key: 'notifyStreak', title: 'Streak about to break', detail: "At 9 PM, if you haven't solved today." },
] as const;

function HandleRow({ platform, me, onChange }: { platform: (typeof PLATFORMS)[number]; me: Me; onChange: () => void }) {
  const linked = me.handles.find((h) => h.platform === platform.id);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(linked?.handle ?? '');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await api(`/me/handles/${platform.id}`, 'PUT', { handle: value });
      setEditing(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  return (
    <View style={styles.handle}>
      <View style={common.row}>
        <View style={[styles.platformTile, { backgroundColor: platformColor(platform.id) }]}><Text style={styles.platformCode}>{platform.code}</Text></View>
        <View style={styles.flex}>
          <Text style={common.bold}>{PLATFORM_NAMES[platform.id]}</Text>
          <Text style={common.small}>{linked ? `@${linked.handle}` : platform.required ? 'Required' : 'Optional'}</Text>
        </View>
        {linked ? <Pill tone={linked.approved ? 'lime' : 'sun'} label={linked.approved ? 'Approved' : 'Waiting for approval'} /> : null}
        {!editing ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${linked ? 'Edit' : 'Link'} ${PLATFORM_NAMES[platform.id]}`} hitSlop={12} onPress={() => setEditing(true)}>
            <Text style={common.link}>{linked ? 'Edit' : 'Link'}</Text>
          </Pressable>
        ) : null}
      </View>
      {editing ? (
        <View style={common.row}>
          <TextInput style={[common.input, styles.flex, common.mono]} value={value} onChangeText={setValue} autoCapitalize="none" autoCorrect={false} accessibilityLabel={`${PLATFORM_NAMES[platform.id]} handle`} />
          <Button title="Save" disabled={!value.trim()} onPress={save} />
        </View>
      ) : null}
      {error ? <Text style={common.error}>{error}</Text> : null}
    </View>
  );
}

function UsernameRow({ me, onChange }: { me: Me; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(me.user.username ?? '');
  const [check, setCheck] = useState<{ available: boolean; error?: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing || value === me.user.username) return setCheck(null);
    const timer = setTimeout(() => {
      api<{ available: boolean; error?: string }>(`/auth/username-available?u=${encodeURIComponent(value)}`).then(setCheck).catch(() => setCheck(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, editing, me.user.username]);

  if (!editing) {
    return (
      <View style={styles.block}>
        <Text style={common.label}>USERNAME</Text>
        <View style={common.between}>
          <Text style={styles.username}>@{me.user.username}</Text>
          {me.user.usernameChangesLeft > 0
            ? <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setEditing(true)}><Text style={common.link}>Change (1 left)</Text></Pressable>
            : <Pill tone="muted" label="Locked" />}
        </View>
        {me.user.usernameChangesLeft < 1 ? <Text style={common.small}>You've used your one change. Ask a coordinator if you really need another.</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.block}>
      <Text style={common.label}>USERNAME</Text>
      <TextInput style={[common.input, common.mono]} value={value} onChangeText={(v) => setValue(v.trim().toLowerCase())} autoCapitalize="none" autoCorrect={false} accessibilityLabel="New username" />
      {check?.available ? <Text style={common.link}>✓ available</Text> : null}
      {check && !check.available ? <Text style={[common.small, { color: theme.pink }]}>{check.error ?? 'taken'}</Text> : null}
      <Text style={styles.warning}>You can only change your username once. After this it's locked for good.</Text>
      {error ? <Text style={common.error}>{error}</Text> : null}
      <View style={common.row}>
        <Button title="Cancel" variant="secondary" flex onPress={() => { setEditing(false); setValue(me.user.username ?? ''); }} />
        <Button title="Use this name for good" variant="warning" flex disabled={!check?.available} onPress={async () => {
          setError('');
          try {
            await api('/me/username', 'PATCH', { username: value });
            setEditing(false);
            onChange();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save.');
          }
        }} />
      </View>
    </View>
  );
}

export default function Settings() {
  const google = useGoogleSignIn();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [year, setYear] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordSent, setPasswordSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const load = useCallback(async () => {
    const data = await api<Me>('/me');
    setMe(data);
    setName(data.user.name);
    setYear(data.user.batchYear ? studyYearOf(data.user.batchYear, Date.now() / 1000) : 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch((err: Error) => setError(err.message));
    }, [load]),
  );

  if (!me) return error ? <Text style={[common.error, styles.page]}>{error}</Text> : null;
  const passwordLabel = me.user.hasPassword ? 'Change password' : 'Set a password';

  async function run(work: () => Promise<void>) {
    setError('');
    setMessage('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Settings" />

      <Text style={common.label}>CODING HANDLES</Text>
      <View style={common.card}>
        {PLATFORMS.map((platform) => <HandleRow key={platform.id} platform={platform} me={me} onChange={load} />)}
      </View>

      <Text style={common.label}>NOTIFICATIONS</Text>
      <View style={common.card}>
        {SWITCHES.map(({ key, title, detail }) => (
          <View key={key} style={common.between}>
            <View style={styles.flex}>
              <Text style={common.bold}>{title}</Text>
              <Text style={common.small}>{detail}</Text>
            </View>
            <Toggle label={title} on={!!me.user[key]} onChange={(on) => run(async () => {
              setMe({ ...me, user: { ...me.user, [key]: on ? 1 : 0 } });
              await api('/me/notifications', 'PATCH', { [key]: on });
            })} />
          </View>
        ))}
      </View>

      <Text style={common.label}>ABOUT YOU</Text>
      <View style={common.card}>
        <UsernameRow me={me} onChange={load} />
        <View style={styles.block}>
          <Text style={common.label}>NAME</Text>
          <TextInput style={common.input} value={name} onChangeText={setName} autoComplete="name" />
        </View>
        <View style={styles.block}>
          <Text style={common.label}>YEAR</Text>
          <View style={styles.years}>
            {STUDY_YEARS.map((option) => (
              <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: year === option.value }} onPress={() => setYear(option.value)} style={[styles.year, year === option.value && styles.yearOn]}>
                <Text style={[styles.yearText, year === option.value && styles.yearTextOn]}>{option.label.replace(' year', '')}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {message ? <Text style={common.link}>{message}</Text> : null}
        <Button title="Save" disabled={!name.trim() || !year} onPress={() => run(async () => {
          await api('/me', 'PUT', { name, batchYear: batchForStudyYear(year, Date.now() / 1000) });
          setMessage('Saved.');
          await load();
        })} />
      </View>

      <Text style={common.label}>SIGN-IN</Text>
      <View style={common.card}>
        <View style={common.between}>
          <View style={styles.flex}>
            <Text style={common.bold}>Google</Text>
            <Text style={common.small} numberOfLines={1}>{me.user.email}</Text>
          </View>
          {me.user.hasGoogle
            ? <Pill tone="lime" label="Connected" />
            : <Pressable accessibilityRole="button" hitSlop={12} disabled={!google.ready} onPress={() => run(async () => { if (await google.signIn()) await load(); })}><Text style={common.link}>Connect</Text></Pressable>}
        </View>
        <View style={styles.block}>
          <Text style={common.bold}>Email and password</Text>
          <Text style={common.small}>Sign in with your email or @username</Text>
          {passwordSent ? (
            <>
              <Text style={common.small}>We sent a 6-digit code to {me.user.email}.</Text>
              <TextInput style={[common.input, common.mono]} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} placeholder="6-digit code" placeholderTextColor={theme.muted} keyboardType="number-pad" maxLength={6} />
              <TextInput style={common.input} value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor={theme.muted} secureTextEntry autoComplete="new-password" />
              <Button title={passwordLabel} disabled={code.length !== 6 || password.length < 8} onPress={() => run(async () => {
                const { token } = await api<{ token: string }>('/auth/reset', 'POST', { email: me.user.email, code, password });
                await setSession(token);
                setPasswordSent(false);
                setCode('');
                setPassword('');
                setMessage('Saved.');
                await load();
              })} />
            </>
          ) : (
            <Button title={passwordLabel} variant="secondary" onPress={() => run(async () => { await api('/auth/forgot', 'POST', { email: me.user.email }); setPasswordSent(true); })} />
          )}
        </View>
      </View>
      {error ? <Text style={common.error}>{error}</Text> : null}
      <Button title="Sign out" variant="danger" onPress={async () => { await clearSession(); router.replace('/login'); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: theme.gutter, paddingTop: 48, gap: 12 },
  flex: { flex: 1 },
  block: { gap: 6 },
  handle: { gap: 8, minHeight: 44 },
  platformTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  platformCode: { color: theme.ink, fontFamily: theme.font.monoBold, fontSize: 13 },
  username: { color: theme.lime, fontFamily: theme.font.monoBold, fontSize: 18 },
  warning: { padding: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.sunLine, backgroundColor: theme.sunTint, color: theme.sunText, fontFamily: theme.font.regular, fontSize: 13 },
  years: { flexDirection: 'row', gap: 8 },
  year: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: theme.line, alignItems: 'center', justifyContent: 'center' },
  yearOn: { backgroundColor: theme.lime, borderColor: theme.lime },
  yearText: { color: theme.text, fontFamily: theme.font.bold, fontSize: 14 },
  yearTextOn: { color: theme.ink },
});
