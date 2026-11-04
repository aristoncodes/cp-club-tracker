import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api';
import { ErrorText } from '../ui';

export function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  async function signIn(idToken?: string) {
    try {
      const { token } = await api<{ token: string }>('/auth/google', 'POST', { idToken });
      setSession(token);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">CP Club Tracker</h1>
      <p className="text-muted">Contests, attendance and the club leaderboard.</p>
      <GoogleLogin
        text="continue_with"
        onSuccess={({ credential }) => signIn(credential)}
        onError={() => setError('Google sign-in failed. Please try again.')}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Link to="/download" className="text-accent">Get the Android app</Link>
    </main>
  );
}
