import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { handleRsvpAction, isRsvpAction, setupNotifications } from '../lib/push';
import { theme } from '../theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
  });
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    setupNotifications().catch(console.warn);
  }, []);

  useEffect(() => {
    if (!response || !fontsLoaded) return;
    Notifications.clearLastNotificationResponse();
    if (isRsvpAction(response)) {
      handleRsvpAction(response).catch(console.warn);
      return;
    }
    const { contestId, screen, url, rsvp } = response.notification.request.content.data ?? {};
    if (screen === 'reason') {
      router.push({ pathname: '/reason', params: { contestId: String(contestId), rsvp: rsvp ? '1' : '' } });
    } else if (typeof url === 'string') {
      Linking.openURL(url);
    }
  }, [response, fontsLoaded]);

  if (!fontsLoaded) return null;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />;
}
