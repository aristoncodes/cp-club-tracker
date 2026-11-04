import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { ratingColor } from 'shared/rating-color';
import { theme } from '../theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled }: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: primary ? theme.accent : theme.surface2, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[styles.title, { color: primary ? theme.bg : theme.text }]}>{title}</Text>
    </Pressable>
  );
}

export function Rating({ value, children }: { value: number | null; children?: ReactNode }) {
  return <Text style={[styles.rating, { color: ratingColor(value ?? 0) }]}>{children ?? value ?? '—'}</Text>;
}

const styles = StyleSheet.create({
  rating: { fontFamily: theme.font.mono, fontSize: 14 },
  button: { height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  title: { fontFamily: theme.font.semibold, fontSize: 14 },
});
