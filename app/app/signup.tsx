import * as Notifications from 'expo-notifications';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { batchForStudyYear, STUDY_YEARS, studyYearOf } from 'shared/batch';
import { api, getSession, setSession, type Me } from '../lib/api';
import { useGoogleSignIn } from '../lib/google';
import { registerPushToken } from '../lib/push';
import { Button, common, Pill, platformColor, PLATFORM_NAMES } from '../lib/ui';
import { theme } from '../theme';

const REQUIRED = ['cf', 'cc'];
const OPTIONAL = ['leetcode', 'atcoder'];
const EMAIL_STEPS = ['account', 'verify', 'about', 'handles', 'notified'];
const GOOGLE_STEPS = ['account', 'about', 'handles', 'notified'];
const RESEND_SECONDS = 60;

function Progress({ steps, current }: { steps: string[]; current: string }) {
  const index = current === 'finished' ? steps.length : steps.indexOf(current);
  return (
    <View style={styles.progress} accessibilityLabel={`Step ${Math.min(index + 1, steps.length)} of ${steps.length}`}>
      {steps.map((step, i) => <View key={step} style={[styles.segment, { backgroundColor: i <= index ? theme.lime : theme.line }]} />)}
    </View>
  );
}

export default function Signup() {
  const params = useLocalSearchParams<{ verifyEmail?: string }>();
  const google = useGoogleSignIn();
  const [me, setMe] = useState<Me | null>(null);
  const [finished, setFinished] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState(params.verifyEmail ?? '');
  const [pendingEmail, setPendingEmail] = useState(params.verifyEmail ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [check, setCheck] = useState<{ available: boolean; error?: string } | null>(null);
  const [year, setYear] = useState(0);
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [showOptional, setShowOptional] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);

  const load = useCallback(async () => {
    const data = await api<Me>('/me');
    setMe(data);
    setName(data.user.name);
    setUsername(data.user.username ?? '');
    setYear(data.user.batchYear ? studyYearOf(data.user.batchYear, Date.now() / 1000) : 0);
    setHandles(Object.fromEntries(data.handles.map((h) => [h.platform, h.handle])));
    return data;
  }, []);

  useEffect(() => {
    getSession().then(async (token) => {
      if (token) await load().catch((err: Error) => setError(err.message));
      setReady(true);
    });
  }, [load]);

  useEffect(() => {
    if (!pendingEmail || me || wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [pendingEmail, me, wait]);

  useEffect(() => {
    if (!username || username === me?.user.username) return setCheck(username ? { available: true } : null);
    const timer = setTimeout(() => {
      api<{ available: boolean; error?: string }>(`/auth/username-available?u=${encodeURIComponent(username)}`).then(setCheck).catch(() => setCheck(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [username, me?.user.username]);

  async function run(work: () => Promise<void>) {
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    }
  }

  async function advance(step: string) {
    await api('/me/onboarding', 'POST', { step });
    await load();
  }

  if (!ready) return null;
  const step = finished ? 'finished' : me ? me.user.onboardingStep : pendingEmail ? 'verify' : 'account';
  const steps = me?.user.hasGoogle ? GOOGLE_STEPS : EMAIL_STEPS;
  const field = (id: string) => (
    <View key={id} style={styles.field}>
      <Text style={[common.label, { color: platformColor(id) }]}>{PLATFORM_NAMES[id].toUpperCase()}</Text>
      <TextInput style={[common.input, common.mono]} value={handles[id] ?? ''} onChangeText={(value) => setHandles((current) => ({ ...current, [id]: value }))} autoCapitalize="none" autoCorrect={false} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Progress steps={steps} current={step} />

      {step === 'account' && (
        <>
          <Text style={styles.title}>Create your account</Text>
          <Button title="Sign up with Google" variant="white" disabled={!google.ready} onPress={() => run(async () => { if (await google.signIn()) await load(); })} />
          <View style={common.row}><View style={styles.rule} /><Text style={common.small}>or with email</Text><View style={styles.rule} /></View>
          <TextInput style={common.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={theme.muted} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <TextInput style={common.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={theme.muted} secureTextEntry autoComplete="new-password" />
          <Text style={common.small}>At least 8 characters. We'll email you a 6-digit code.</Text>
          <Button title="Create account" disabled={!email || password.length < 8} onPress={() => run(async () => { await api('/auth/signup', 'POST', { email, password }); setPendingEmail(email); setWait(RESEND_SECONDS); })} />
          <Pressable accessibilityRole="link" style={styles.center} onPress={() => router.replace('/login')}><Text style={common.muted}>Already a member? <Text style={common.bold}>Sign in</Text></Text></Pressable>
        </>
      )}

      {step === 'verify' && (
        <>
          <Text style={styles.title}>Check your email</Text>
          <Text style={common.muted}>We sent a 6-digit code to {pendingEmail}. It expires in 10 minutes.</Text>
          <TextInput style={styles.code} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" textContentType="oneTimeCode" accessibilityLabel="6-digit code" autoFocus />
          {wait > 0
            ? <Text style={common.muted}>Resend in <Text style={common.mono}>0:{String(wait).padStart(2, '0')}</Text></Text>
            : <Pressable accessibilityRole="button" hitSlop={12} onPress={() => run(async () => { await api('/auth/resend', 'POST', { email: pendingEmail, purpose: 'verify' }); setWait(RESEND_SECONDS); })}><Text style={common.link}>Resend code</Text></Pressable>}
          <View style={common.row}>
            <Button title="Change email" variant="secondary" flex onPress={() => { setPendingEmail(''); setCode(''); }} />
            <Button title="Verify" flex disabled={code.length !== 6} onPress={() => run(async () => {
              const { token } = await api<{ token: string }>('/auth/verify', 'POST', { email: pendingEmail, code });
              await setSession(token);
              await load();
            })} />
          </View>
        </>
      )}

      {step === 'about' && me && (
        <>
          <Text style={styles.eyebrow}>{me.user.hasGoogle ? 'Signed up with Google' : '✓ Email verified'}</Text>
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
            <Text style={common.small}>You can sign in with it, and change it once later.</Text>
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
          <Button title="Continue" disabled={!name.trim() || !year || !check?.available} onPress={() => run(async () => {
            await api('/me', 'PUT', { name, username, batchYear: batchForStudyYear(year, Date.now() / 1000) });
            await advance('handles');
          })} />
        </>
      )}

      {step === 'handles' && (
        <>
          <Text style={styles.title}>Link your handles</Text>
          {REQUIRED.map(field)}
          {showOptional ? OPTIONAL.map(field) : (
            <Pressable accessibilityRole="button" style={styles.addOptional} onPress={() => setShowOptional(true)}><Text style={common.muted}>+ LeetCode, AtCoder (optional)</Text></Pressable>
          )}
          <Text style={styles.note}>A coordinator checks each handle, usually within a day.</Text>
          <Button title="Continue" disabled={REQUIRED.some((id) => !handles[id]?.trim())} onPress={() => run(async () => {
            for (const id of [...REQUIRED, ...OPTIONAL]) {
              if (handles[id]?.trim()) await api(`/me/handles/${id}`, 'PUT', { handle: handles[id] });
            }
            await advance('notified');
          })} />
        </>
      )}

      {step === 'notified' && (
        <>
          <Text style={styles.title}>Never miss a contest</Text>
          <View style={[styles.preview, styles.previewCard]}><Text style={common.bold}>1h</Text><Text style={common.text}>A round starts in an hour.</Text></View>
          <View style={[styles.preview, styles.previewViolet]}><Text style={styles.previewWhite}>5m</Text><Text style={styles.previewWhite}>Giving it? Yes · No</Text></View>
          <View style={[styles.preview, styles.previewLime]}><Text style={styles.previewInk}>+20</Text><Text style={styles.previewInk}>Marked present.</Text></View>
          {notificationsOn
            ? <View style={styles.onStrip}><Text style={styles.previewInk}>✓ Notifications on</Text></View>
            : <Button title="Allow notifications" variant="secondary" onPress={() => run(async () => {
                await registerPushToken();
                setNotificationsOn((await Notifications.getPermissionsAsync()).granted);
              })} />}
          <Button title="Finish" onPress={() => run(async () => {
            await api('/me/onboarding', 'POST', { step: 'done' });
            await load();
            setFinished(true);
          })} />
        </>
      )}

      {step === 'finished' && me && (
        <>
          <View style={styles.doneTile}><Text style={styles.doneMark}>✓</Text></View>
          <Text style={styles.title}>You're in, <Text style={{ color: theme.lime }}>@{me.user.username}</Text>.</Text>
          <Text style={common.muted}>You can use everything now. You'll join the leaderboard once a coordinator approves your handles.</Text>
          {me.handles.map((h) => (
            <View key={h.platform} style={[common.card, common.between]}>
              <Text style={[common.text, common.mono]}>@{h.handle}</Text>
              <Pill tone={h.approved ? 'lime' : 'sun'} label={h.approved ? 'Approved' : 'Waiting for approval'} />
            </View>
          ))}
          <Button title="Go to Home" onPress={() => router.replace('/')} />
        </>
      )}

      {error ? <Text style={common.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: theme.gutter, paddingTop: 56, gap: 14 },
  progress: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  title: { color: theme.text, fontFamily: theme.font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.9 },
  eyebrow: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: theme.violetTint, color: theme.violetSoft, fontFamily: theme.font.bold, fontSize: 12 },
  rule: { flex: 1, height: 1, backgroundColor: theme.line },
  center: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  code: { height: 72, borderRadius: 14, borderWidth: 1, borderColor: theme.lime, backgroundColor: theme.card, color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 32, letterSpacing: 12, textAlign: 'center' },
  field: { gap: 6 },
  usernameInput: { flex: 1, color: theme.text, fontFamily: theme.font.monoBold, fontSize: 16, height: 48 },
  years: { flexDirection: 'row', gap: 8 },
  year: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  yearOn: { backgroundColor: theme.lime, borderColor: theme.lime },
  yearText: { color: theme.text, fontFamily: theme.font.bold, fontSize: 14 },
  yearTextOn: { color: theme.ink },
  addOptional: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.line },
  note: { padding: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.violetTint, color: theme.violetSoft, fontFamily: theme.font.regular, fontSize: 13 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16 },
  previewCard: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, transform: [{ rotate: '-1deg' }] },
  previewViolet: { backgroundColor: theme.violet, transform: [{ rotate: '1deg' }] },
  previewLime: { backgroundColor: theme.lime, transform: [{ rotate: '-1deg' }] },
  previewWhite: { color: theme.white, fontFamily: theme.font.bold, fontSize: 14 },
  previewInk: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 14 },
  onStrip: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: theme.lime },
  doneTile: { width: 64, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.lime, transform: [{ rotate: '-6deg' }] },
  doneMark: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 30 },
});
