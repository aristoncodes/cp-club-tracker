import { exchangeCodeAsync, ResponseType, useAuthRequest, useAutoDiscovery } from 'expo-auth-session';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, setSession } from '../lib/api';
import { Button } from '../lib/ui';
import { theme } from '../theme';

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const REDIRECT_URI = 'com.cpclub.tracker:/oauthredirect';

export default function Login() {
  const discovery = useAutoDiscovery('https://accounts.google.com');
  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scopes: ['openid', 'email', 'profile'],
      responseType: ResponseType.Code,
      usePKCE: true,
    },
    discovery,
  );
  const [error, setError] = useState('');

  async function signIn() {
    setError('');
    try {
      const result = await promptAsync();
      if (result.type !== 'success' || !discovery) return;
      const tokens = await exchangeCodeAsync(
        {
          clientId: CLIENT_ID,
          redirectUri: REDIRECT_URI,
          code: result.params.code,
          extraParams: { code_verifier: request?.codeVerifier ?? '' },
        },
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
        <View style={styles.logoTile}><Text style={styles.logoMark}>&gt;_</Text></View>
        <Text style={styles.wordmark}>grind<Text style={styles.dot}>.</Text>club</Text>
      </View>
      <Text style={styles.headline}>
        Show up.{'\n'}<Text style={styles.dot}>Solve more.</Text>{'\n'}Climb the board.
      </Text>
      <Text style={styles.purpose}>Contest reminders, attendance and a live leaderboard for the club.</Text>
      <Button title="Continue with Google" onPress={signIn} disabled={!request} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: theme.gutter, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.violet, transform: [{ rotate: '-6deg' }] },
  logoMark: { color: '#FFFFFF', fontFamily: theme.font.monoBold, fontSize: 14 },
  wordmark: { color: theme.text, fontFamily: theme.font.display, fontSize: 22 },
  dot: { color: theme.lime },
  headline: { color: theme.text, fontFamily: theme.font.display, fontSize: 42, lineHeight: 46, letterSpacing: -1.4 },
  purpose: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 15 },
  error: { color: theme.pink, fontFamily: theme.font.regular, fontSize: 14 },
});
