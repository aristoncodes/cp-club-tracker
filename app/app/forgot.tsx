import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api, setSession } from '../lib/api';
import { Button, common, ScreenHeader } from '../lib/ui';
import { theme } from '../theme';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    try {
      if (!sent) {
        await api('/auth/forgot', 'POST', { email });
        setSent(true);
        return;
      }
      const { token } = await api<{ token: string }>('/auth/reset', 'POST', { email, code, password });
      await setSession(token);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Reset password" />
      <Text style={common.muted}>
        {sent ? `If ${email} has an account, we sent a 6-digit code. It expires in 10 minutes.` : "We'll email you a code. It also works if you only ever used Google and want to set a password."}
      </Text>
      {sent ? (
        <>
          <TextInput style={common.input} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} placeholder="6-digit code" placeholderTextColor={theme.muted} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" />
          <TextInput style={common.input} value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor={theme.muted} secureTextEntry autoComplete="new-password" />
        </>
      ) : (
        <TextInput style={common.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={theme.muted} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      )}
      {error ? <Text style={common.error}>{error}</Text> : null}
      <Button title={sent ? 'Set new password' : 'Send code'} onPress={submit} disabled={sent ? code.length !== 6 || password.length < 8 : !email} />
    </View>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, padding: theme.gutter, paddingTop: 48, gap: 14 } });
