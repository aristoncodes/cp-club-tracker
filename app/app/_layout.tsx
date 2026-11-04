import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold, JetBrainsMono_800ExtraBold } from '@expo-google-fonts/jetbrains-mono';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { reloadAsync, useUpdates } from 'expo-updates';
import { useEffect } from 'react';
import { Linking, Pressable, StatusBar, StyleSheet, Text } from 'react-native';
import { handleRsvpAction, isRsvpAction, setupNotifications } from '../lib/push';
import { theme } from '../theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold,
    SpaceGrotesk_700Bold,
  });
  const response = Notifications.useLastNotificationResponse();
  const { isUpdatePending } = useUpdates();

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
  return (
    <>
      <StatusBar barStyle="light-content" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.ink } }} />
      {isUpdatePending && (
        <Pressable accessibilityRole="button" onPress={() => reloadAsync().catch(console.warn)} style={styles.update}>
          <Text style={styles.updateText}>Update available, tap to restart</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  update: { position: 'absolute', left: theme.gutter, right: theme.gutter, bottom: 96, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.lime },
  updateText: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 14 },
});
