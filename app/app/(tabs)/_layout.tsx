import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { theme } from '../../theme';

const ICONS = { index: 'home', leaderboard: 'bar-chart-2', feed: 'list', profile: 'user' } as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.lime,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.ink, borderTopColor: theme.line, borderTopWidth: 1 },
        tabBarLabelStyle: { fontFamily: theme.font.bold, fontSize: 12 },
        tabBarIcon: ({ color }) => <Feather name={ICONS[route.name as keyof typeof ICONS]} size={22} color={String(color)} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Board' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    </Tabs>
  );
}
