import { exchangeCodeAsync, ResponseType, useAuthRequest, useAutoDiscovery } from 'expo-auth-session';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { api, setSession } from '../lib/api';
import { Button, common } from '../lib/ui';
import { theme } from '../theme';

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const REDIRECT_URI = 'com.cpclub.tracker:/oauthredirect';

export default function Login() {
  const discovery = useAutoDiscovery('https://accounts.google.com');
  const [request, , promptAsync] = useAuthRequest(
    { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, scopes: ['openid', 'email', 'profile'], responseType: ResponseType.Code, usePKCE: true },
    discovery,
  );
  const [error, setError] = useState('');

  async function signIn() {
    setError('');
    try {
      const result = await promptAsync();
      if (result.type !== 'success' || !discovery) return;
      const tokens = await exchangeCodeAsync(
        { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, code: result.params.code, extraParams: { code_verifier: request?.codeVerifier ?? '' } },
        discovery,
      );
      const { token } = await api<{ token: string }>('/auth/google', 'POST', { idToken: tokens.idToken });
      await setSession(token);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.brand}>
        <Image source={require('../assets/icon.png')} style={styles.logoTile} />
        <Text style={styles.wordmark}>OOPS <Text style={styles.lime}>CLUB</Text></Text>
      </View>
      <View style={styles.middle}>
        <Text style={styles.headline}>Welcome back.{'\n'}<Text style={styles.lime}>Let's grind.</Text></Text>
        <Text style={common.muted}>Contest reminders, attendance and a live leaderboard. New here? The same button gets you started.</Text>
        <Button title="Continue with Google" variant="white" onPress={signIn} disabled={!request} />
        {error ? <Text style={common.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: theme.gutter, paddingTop: 56 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoTile: { width: 34, height: 34, borderRadius: 10, transform: [{ rotate: '-6deg' }] },
  wordmark: { color: theme.text, fontFamily: theme.font.display, fontSize: 22 },
  lime: { color: theme.lime },
  middle: { flex: 1, justifyContent: 'center', gap: 16 },
  headline: { color: theme.text, fontFamily: theme.font.display, fontSize: 44, lineHeight: 48, letterSpacing: -1.5 },
});
