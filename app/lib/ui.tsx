import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ratingColor } from 'shared/rating-color';
import { theme } from '../theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'onViolet';
  disabled?: boolean;
  flex?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled, flex }: ButtonProps) {
  const primary = variant === 'primary';
  const outline = variant === 'onViolet' ? theme.violetSoft : theme.line;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        flex && styles.flex,
        primary ? { backgroundColor: theme.lime } : { borderWidth: 2, borderColor: outline },
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? theme.ink : variant === 'onViolet' ? '#FFFFFF' : theme.text }]}>{title}</Text>
    </Pressable>
  );
}

export function Rating({ value, children }: { value: number | null; children?: ReactNode }) {
  return <Text style={[styles.rating, { color: ratingColor(value ?? 0) }]}>{children ?? value ?? '—'}</Text>;
}

const AVATAR_COLORS = [theme.lime, theme.pink, theme.sun, theme.sky, theme.lilac, theme.orange];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? '?'}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

export function Avatar({ userId, name, size = 38 }: { userId: number; name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_COLORS[userId % AVATAR_COLORS.length] }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials(name)}</Text>
    </View>
  );
}

export function StreakPill({ streak }: { streak: number }) {
  return (
    <View style={styles.streak} accessibilityLabel={`Solve streak: ${streak} days`}>
      <Feather name="zap" size={15} color={theme.ink} />
      <Text style={styles.streakText}>{streak}</Text>
    </View>
  );
}

export function ProgressBar({ percent, color = theme.lime }: { percent: number; color?: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { backgroundColor: color, width: `${Math.max(0, Math.min(100, percent))}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  flex: { flex: 1 },
  disabled: { opacity: 0.5 },
  buttonText: { fontFamily: theme.font.bold, fontSize: 15 },
  rating: { fontFamily: theme.font.monoBold, fontSize: 13 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.ink, fontFamily: theme.font.bold },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: 12, borderRadius: 999, backgroundColor: theme.sun },
  streakText: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 14 },
  track: { height: 10, borderRadius: 999, backgroundColor: theme.card2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});
