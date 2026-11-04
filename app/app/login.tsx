import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, api, setSession } from '../lib/api';
import { useGoogleSignIn } from '../lib/google';
import { Button, common } from '../lib/ui';
import { theme } from '../theme';

export default function Login() {
  const google = useGoogleSignIn();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setError('');
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>('/auth/login', 'POST', { identifier, password });
      await setSession(token);
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError && err.message === 'verify') {
        if (identifier.includes('@')) return router.replace({ pathname: '/signup', params: { verifyEmail: identifier } });
        return setError('Sign in with your email to finish verifying it.');
      }
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setError('');
    try {
      if (await google.signIn()) router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}>
        <View style={styles.logoTile}><Text style={styles.logoMark}>&gt;_</Text></View>
        <Text style={styles.wordmark}>grind<Text style={styles.lime}>.</Text>club</Text>
      </View>
      <View style={styles.middle}>
        <Text style={styles.headline}>Welcome back.{'\n'}<Text style={styles.lime}>Let's grind.</Text></Text>
        <Text style={common.muted}>Contest reminders, attendance and a live leaderboard.</Text>
        <Button title="Continue with Google" variant="white" onPress={withGoogle} disabled={!google.ready} />
        <View style={common.row}><View style={styles.rule} /><Text style={common.small}>or</Text><View style={styles.rule} /></View>
        <TextInput style={common.input} value={identifier} onChangeText={setIdentifier} placeholder="Email or username" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} autoComplete="username" />
        <View style={styles.passwordLabel}>
          <Pressable accessibilityRole="link" hitSlop={12} onPress={() => router.push('/forgot')}><Text style={common.link}>Forgot?</Text></Pressable>
        </View>
        <TextInput style={common.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={theme.muted} secureTextEntry autoComplete="current-password" />
        {error ? <Text style={common.error}>{error}</Text> : null}
        <View style={styles.signIn}><Button title="Sign in" onPress={signIn} disabled={busy || !identifier || !password} /></View>
      </View>
      <Pressable accessibilityRole="link" onPress={() => router.push('/signup')} style={styles.bottom}>
        <Text style={common.muted}>New to the club? <Text style={common.bold}>Create your account</Text></Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: theme.gutter, paddingTop: 56, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.violet, transform: [{ rotate: '-6deg' }] },
  logoMark: { color: theme.white, fontFamily: theme.font.monoBold, fontSize: 14 },
  wordmark: { color: theme.text, fontFamily: theme.font.display, fontSize: 22 },
  lime: { color: theme.lime },
  middle: { flex: 1, justifyContent: 'center', gap: 14 },
  headline: { color: theme.text, fontFamily: theme.font.display, fontSize: 44, lineHeight: 48, letterSpacing: -1.5 },
  rule: { flex: 1, height: 1, backgroundColor: theme.line },
  passwordLabel: { alignItems: 'flex-end', marginBottom: -8 },
  signIn: { marginTop: 4 },
  bottom: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
