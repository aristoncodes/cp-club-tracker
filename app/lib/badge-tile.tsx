import { Modal, StyleSheet, Text, View } from 'react-native';
import { BADGES, type BadgeId } from 'shared/badges';
import { theme } from '../theme';
import { Button, common } from './ui';

const ACCENTS: Record<string, string> = { lime: theme.lime, pink: theme.pink, sun: theme.sun, sky: theme.sky };

export function BadgeTile({ id, earned, size = 56 }: { id: BadgeId; earned: boolean; size?: number }) {
  const badge = BADGES.find((b) => b.id === id)!;
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: earned ? ACCENTS[badge.accent] : theme.lock }]}>
      <Text style={{ color: earned ? theme.ink : theme.lockGlyph, fontFamily: theme.font.monoHeavy, fontSize: size * 0.3 }}>{badge.glyph}</Text>
    </View>
  );
}

const CONFETTI = [
  { left: '8%', top: 18, color: theme.lime, rotate: '12deg' }, { left: '26%', top: 8, color: theme.pink, rotate: '-45deg' }, { left: '76%', top: 12, color: theme.sun, rotate: '45deg' }, { left: '90%', top: 30, color: theme.sky, rotate: '12deg' },
  { left: '6%', top: 90, color: theme.sun, rotate: '-12deg' }, { left: '92%', top: 110, color: theme.pink, rotate: '45deg' },
] as const;

export function Celebration({ id, onDone }: { id: BadgeId; onDone: () => void }) {
  const badge = BADGES.find((b) => b.id === id)!;
  const next = BADGES.find((b) => b.stat === badge.stat && b.goal > badge.goal);
  return (
    <Modal transparent animationType="slide" onRequestClose={onDone}>
      <View style={styles.dim}>
        <View style={styles.sheet}>
          {CONFETTI.map((piece, index) => <View key={index} style={[styles.confetti, { left: piece.left, top: piece.top, backgroundColor: piece.color, transform: [{ rotate: piece.rotate }] }]} />)}
          <Text style={common.label}>NEW BADGE</Text>
          <BadgeTile id={id} earned size={112} />
          <Text style={styles.name}>{badge.name}</Text>
          <Text style={[common.muted, styles.centre]}>{next ? `Next: ${next.name}. ${next.how}.` : badge.how}</Text>
          <View style={styles.action}><Button title="Nice!" onPress={onDone} /></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', borderRadius: 16, transform: [{ rotate: '-6deg' }] },
  dim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,14,20,0.7)' },
  sheet: { alignItems: 'center', gap: 12, padding: 28, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: theme.card, overflow: 'hidden' },
  confetti: { position: 'absolute', width: 8, height: 12 },
  name: { color: theme.text, fontFamily: theme.font.display, fontSize: 32, letterSpacing: -0.8 },
  centre: { textAlign: 'center' },
  action: { alignSelf: 'stretch' },
});
