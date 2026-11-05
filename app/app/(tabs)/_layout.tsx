import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { theme } from '../../theme';

const ICONS = { index: 'home', leaderboard: 'bar-chart-2', practice: 'target', contests: 'calendar' } as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: theme.ink },
        tabBarActiveTintColor: theme.lime,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.ink, borderTopColor: theme.line, borderTopWidth: 1 },
        tabBarLabelStyle: { fontFamily: theme.font.bold, fontSize: 12 },
        tabBarIcon: ({ color }) =>
          route.name === 'duels' ? <MaterialCommunityIcons name="sword-cross" size={22} color={String(color)} /> : <Feather name={ICONS[route.name as keyof typeof ICONS]} size={22} color={String(color)} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Board' }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
      <Tabs.Screen name="duels" options={{ title: 'Duels' }} />
      <Tabs.Screen name="contests" options={{ title: 'Contests' }} />
    </Tabs>
  );
}
