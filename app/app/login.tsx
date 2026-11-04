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
      <Text style={styles.title}>CP Club Tracker</Text>
      <Text style={styles.purpose}>Contests, attendance and the club leaderboard.</Text>
      <Button title="Continue with Google" onPress={signIn} disabled={!request} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 16, gap: 16 },
  title: { color: theme.text, fontFamily: theme.font.bold, fontSize: 24 },
  purpose: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14 },
  error: { color: theme.absent, fontFamily: theme.font.regular, fontSize: 14 },
});
