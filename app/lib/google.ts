import { exchangeCodeAsync, ResponseType, useAuthRequest, useAutoDiscovery } from 'expo-auth-session';
import { api, setSession } from './api';

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const REDIRECT_URI = 'com.cpclub.tracker:/oauthredirect';

export function useGoogleSignIn() {
  const discovery = useAutoDiscovery('https://accounts.google.com');
  const [request, , promptAsync] = useAuthRequest(
    { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, scopes: ['openid', 'email', 'profile'], responseType: ResponseType.Code, usePKCE: true },
    discovery,
  );

  async function signIn(): Promise<boolean> {
    const result = await promptAsync();
    if (result.type !== 'success' || !discovery) return false;
    const tokens = await exchangeCodeAsync(
      { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, code: result.params.code, extraParams: { code_verifier: request?.codeVerifier ?? '' } },
      discovery,
    );
    const { token } = await api<{ token: string }>('/auth/google', 'POST', { idToken: tokens.idToken });
    await setSession(token);
    return true;
  }

  return { ready: !!request, signIn };
}
