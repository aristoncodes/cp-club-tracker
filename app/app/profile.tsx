import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { api, type Me } from '../lib/api';
import { ProfileView } from '../lib/profile-view';

export default function MyProfile() {
  const [id, setId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Me>('/me').then((me) => setId(me.user.id)).catch(console.warn);
    }, []),
  );

  return id ? <ProfileView id={id} own /> : null;
}
