import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api';
import { Button, ErrorText, inputClass, Logo, PasswordInput } from '../ui';

export function Forgot() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      if (!sent) {
        await api('/auth/forgot', 'POST', { email });
        setSent(true);
        return;
      }
      const { token } = await api<{ token: string }>('/auth/reset', 'POST', { email, code, password });
      setSession(token);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center gap-5 px-6 py-10">
      <Logo />
      <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">{sent ? 'Check your email.' : 'Forgot your password?'}</h1>
      <p className="text-muted">
        {sent ? `If ${email} has an account, we sent a 6-digit code. It expires in 10 minutes.` : "We'll email you a code. It also works if you only ever used Google and want to set a password."}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {!sent && <input type="email" aria-label="Email" placeholder="Email" autoComplete="email" className={`${inputClass} h-12 rounded-[14px]`} value={email} onChange={(e) => setEmail(e.target.value)} />}
        {sent && (
          <>
            <input aria-label="6-digit code" placeholder="6-digit code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" className={`${inputClass} num h-12 rounded-[14px]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <PasswordInput label="New password" autoComplete="new-password" value={password} onChange={setPassword} />
          </>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" disabled={sent ? code.length !== 6 || password.length < 8 : !email}>{sent ? 'Set new password' : 'Send code'}</Button>
      </form>
      <Link to="/login" className="font-bold text-lime hover:underline">← Back to sign in</Link>
    </main>
  );
}
