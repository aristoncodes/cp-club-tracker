import { useLocalSearchParams } from 'expo-router';
import { ProfileView } from '../../lib/profile-view';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProfileView id={Number(id)} />;
}
