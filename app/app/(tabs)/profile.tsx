import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { api, clearSession, type Me } from '../../lib/api';
import { ProfileView } from '../../lib/profile-view';
import { Button } from '../../lib/ui';

export default function MyProfile() {
  const [id, setId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Me>('/me').then((me) => setId(me.user.id)).catch(console.warn);
    }, []),
  );

  async function signOut() {
    await clearSession();
    router.replace('/login');
  }

  if (!id) return null;
  return <ProfileView id={id} footer={<Button title="Sign out" variant="secondary" onPress={signOut} />} />;
}
