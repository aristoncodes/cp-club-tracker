import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ratingColor } from 'shared/rating-color';
import { REASONS } from 'shared/reasons';
import { formatIST } from 'shared/time';
import { theme } from '../theme';
import type { Contest } from './api';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'onViolet' | 'danger' | 'warning' | 'white';
  disabled?: boolean;
  flex?: boolean;
};

const BUTTON_STYLES = {
  primary: { fill: theme.lime, text: theme.ink, outline: undefined },
  warning: { fill: theme.sun, text: theme.ink, outline: undefined },
  white: { fill: theme.white, text: theme.ink, outline: undefined },
  secondary: { fill: undefined, text: theme.text, outline: theme.line },
  onViolet: { fill: undefined, text: theme.white, outline: theme.violetSoft },
  danger: { fill: undefined, text: theme.pink, outline: theme.pink },
};

export function Button({ title, onPress, variant = 'primary', disabled, flex }: ButtonProps) {
  const look = BUTTON_STYLES[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, flex && styles.flex, look.fill ? { backgroundColor: look.fill } : { borderWidth: 2, borderColor: look.outline }, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, { color: look.text }]}>{title}</Text>
    </Pressable>
  );
}

export function Rating({ value, children }: { value: number | null; children?: ReactNode }) {
  return <Text style={[styles.rating, { color: ratingColor(value ?? 0) }]}>{children ?? value ?? '—'}</Text>;
}

export function RatingChip({ value }: { value: number }) {
  return <View style={styles.chip}><Rating value={value} /></View>;
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

export function AvatarButton({ userId, name }: { userId: number; name: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push('/profile')}>
      <Avatar userId={userId} name={name} size={44} />
    </Pressable>
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

export function BellButton({ unread }: { unread: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Announcements, ${unread} unread` : 'Announcements'} style={styles.bell} onPress={() => router.push('/announcements')}>
      <Feather name="bell" size={20} color={theme.text} />
      {unread > 0 ? <View style={styles.bellDot} /> : null}
    </Pressable>
  );
}

export function openLink(link: string): void {
  if (link.startsWith('/')) router.push(link as Href);
  else Linking.openURL(link);
}

export function ProgressBar({ percent, color = theme.lime }: { percent: number; color?: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { backgroundColor: color, width: `${Math.max(0, Math.min(100, percent))}%` }]} />
    </View>
  );
}

export function ScreenHeader({ title, centred, right }: { title: string; centred?: boolean; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerButton}>
        <Feather name="chevron-left" size={26} color={theme.text} />
      </Pressable>
      <Text style={[centred ? styles.headerCentred : styles.headerTitle]} numberOfLines={1}>{title}</Text>
      <View style={styles.headerButton}>{right}</View>
    </View>
  );
}

const PILLS = {
  lime: { backgroundColor: theme.limeTint, color: theme.lime },
  sun: { backgroundColor: theme.sunTint, color: theme.sunText },
  pink: { backgroundColor: theme.pinkTint, color: theme.pinkText },
  muted: { backgroundColor: theme.card2, color: theme.muted },
};

export function Pill({ tone, label }: { tone: keyof typeof PILLS; label: string }) {
  const { backgroundColor, color } = PILLS[tone];
  return <View style={[styles.pill, { backgroundColor }]}><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}

export function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      hitSlop={8}
      onPress={() => onChange(!on)}
      style={[styles.toggle, { backgroundColor: on ? theme.lime : theme.line, alignItems: on ? 'flex-end' : 'flex-start' }]}
    >
      <View style={[styles.knob, { backgroundColor: on ? theme.ink : theme.muted }]} />
    </Pressable>
  );
}

const PLATFORM_COLORS: Record<string, string> = { cf: theme.cfBlue, cc: theme.orange, atcoder: theme.text, leetcode: theme.sun };
export const PLATFORM_NAMES: Record<string, string> = { cf: 'Codeforces', cc: 'CodeChef', leetcode: 'LeetCode', atcoder: 'AtCoder' };
export const platformColor = (platform: string) => PLATFORM_COLORS[platform] ?? theme.text;

const RSVP_PILLS: Record<string, ReactNode> = {
  yes: <Pill tone="lime" label="Going" />,
  no: <Pill tone="pink" label="Can't make it" />,
};

export function ContestRow({ contest }: { contest: Contest }) {
  const [date, time] = formatIST(contest.startAt).split(' · ');
  const [weekday, day] = date.split(', ');
  return (
    <Pressable style={styles.contestRow} onPress={() => Linking.openURL(contest.url)}>
      <View style={styles.dateTile}>
        <Text style={styles.dateWeekday}>{weekday.toUpperCase()}</Text>
        <Text style={styles.dateDay}>{day.split(' ')[0]}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.contestName} numberOfLines={1}>{contest.name}</Text>
        <Text style={common.small}><Text style={{ color: platformColor(contest.platform) }}>{PLATFORM_NAMES[contest.platform]}</Text> · {time}</Text>
      </View>
      {RSVP_PILLS[contest.rsvp ?? ''] ?? <Pill tone="muted" label="Not answered" />}
    </Pressable>
  );
}

export function CellMark({ status, reasonType }: { status: string | null; reasonType: string | null }) {
  if (!status) return <View style={[styles.cell, { backgroundColor: theme.card2 }]} />;
  if (status === 'present') return <View style={[styles.cell, { backgroundColor: theme.lime }]}><Text style={styles.cellText}>✓</Text></View>;
  if (!reasonType) return <View style={[styles.cell, styles.cellPending]}><Text style={[styles.cellText, { color: theme.sun }]}>?</Text></View>;
  return <View style={[styles.cell, { backgroundColor: theme.pink }]}><Text style={styles.cellText}>{REASONS.find((r) => r.id === reasonType)?.letter ?? 'O'}</Text></View>;
}

export const common = StyleSheet.create({
  title: { color: theme.text, fontFamily: theme.font.display, fontSize: 30, letterSpacing: -0.9 },
  heading: { color: theme.text, fontFamily: theme.font.display, fontSize: 18, letterSpacing: -0.3 },
  label: { color: theme.muted, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.8 },
  text: { color: theme.text, fontFamily: theme.font.regular, fontSize: 14 },
  bold: { color: theme.text, fontFamily: theme.font.bold, fontSize: 14 },
  muted: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 14 },
  small: { color: theme.muted, fontFamily: theme.font.regular, fontSize: 12 },
  error: { color: theme.pink, fontFamily: theme.font.regular, fontSize: 14 },
  link: { color: theme.lime, fontFamily: theme.font.bold, fontSize: 13 },
  card: { gap: 10, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  input: { height: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card, color: theme.text, fontFamily: theme.font.regular, fontSize: 16 },
  mono: { fontFamily: theme.font.monoBold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});

const styles = StyleSheet.create({
  rating: { fontFamily: theme.font.monoBold, fontSize: 13 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.card2 },
  button: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  flex: { flex: 1 },
  disabled: { opacity: 0.5 },
  buttonText: { fontFamily: theme.font.bold, fontSize: 15 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.ink, fontFamily: theme.font.bold },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: 12, borderRadius: 999, backgroundColor: theme.sun },
  streakText: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 14 },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  bellDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.pink },
  track: { height: 10, borderRadius: 999, backgroundColor: theme.card2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: theme.text, fontFamily: theme.font.display, fontSize: 24, letterSpacing: -0.6 },
  headerCentred: { flex: 1, textAlign: 'center', color: theme.text, fontFamily: theme.font.bold, fontSize: 16 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontFamily: theme.font.bold, fontSize: 11 },
  toggle: { width: 52, height: 30, padding: 3, borderRadius: 15 },
  knob: { width: 24, height: 24, borderRadius: 12 },
  contestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  dateTile: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.card2 },
  dateWeekday: { color: theme.muted, fontFamily: theme.font.bold, fontSize: 9 },
  dateDay: { color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 15 },
  contestName: { color: theme.text, fontFamily: theme.font.bold, fontSize: 14 },
  cell: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  cellPending: { borderWidth: 2, borderStyle: 'dashed', borderColor: theme.sun },
  cellText: { color: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 12 },
});
