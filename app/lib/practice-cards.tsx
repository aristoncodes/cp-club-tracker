import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { potdBandLabel } from 'shared/potd';
import { ratingColor } from 'shared/rating-color';
import { theme } from '../theme';
import { api, type Potd } from './api';
import { Button, common } from './ui';

const RING_STROKE = 8;

export function GoalRing({ done, target, size = 64 }: { done: number; target: number; size?: number }) {
  const radius = (size - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = target ? Math.min(1, done / target) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={target ? `${done} of ${target}` : 'No goal set'}>
      <Svg width={size} height={size} style={styles.ring}>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={RING_STROKE} stroke={theme.card2} />
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={RING_STROKE} strokeLinecap="round" stroke={theme.lime} strokeDasharray={`${circumference}`} strokeDashoffset={circumference * (1 - share)} />
      </Svg>
      <Text style={styles.ringText}>{target ? `${done}/${target}` : '—'}</Text>
    </View>
  );
}

export function PotdCard({ data, onChange }: { data: Potd; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  if (!data.problem) {
    return (
      <View style={common.card}>
        <Text style={common.label}>PROBLEM OF THE DAY</Text>
        <Text style={common.muted}>{data.reason === 'needsHandle' ? 'Your problem appears once your Codeforces handle is approved.' : "Today's problem is on its way."}</Text>
      </View>
    );
  }
  const { problem } = data;

  async function reveal() {
    setError('');
    try {
      await api('/practice/potd/reveal', 'POST');
      setConfirming(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reveal.');
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>PROBLEM OF THE DAY · {potdBandLabel(data.band)}</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{problem.name}</Text>
        <Text style={[styles.rating, { color: ratingColor(problem.rating) }]}>{problem.rating}</Text>
      </View>
      <Text style={styles.line}>
        {data.solvedAt ? `Solved · streak ${data.streak} · ` : ''}Solved by {data.solvedCount} of {data.bandCount} in your band ·{' '}
        {data.revealed ? <Text><Text style={styles.faded}>+{data.bonusRevealed}</Text> bonus · tags revealed</Text> : `+${data.bonus} bonus`}
      </Text>
      {problem.tags ? (
        <View style={styles.tags}>{problem.tags.map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View>
      ) : !confirming ? (
        <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={styles.reveal}>
          <Text style={styles.revealText}>Reveal tags · bonus +{data.bonusFull} → +{data.bonusRevealed}</Text>
        </Pressable>
      ) : (
        <View style={styles.confirm}>
          <Text style={common.bold}>Reveal tags? Your bonus drops from +{data.bonusFull} to +{data.bonusRevealed}.</Text>
          <View style={common.row}>
            <Button title="Keep hidden" flex onPress={() => setConfirming(false)} />
            <Button title="Reveal" flex variant="secondary" onPress={reveal} />
          </View>
          {error ? <Text style={common.error}>{error}</Text> : null}
        </View>
      )}
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(problem.url)} style={styles.solve}>
        <Text style={styles.solveText}>Solve it</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  ringText: { color: theme.text, fontFamily: theme.font.monoHeavy, fontSize: 13 },
  card: { gap: 10, padding: 18, borderRadius: 22, backgroundColor: theme.lime },
  eyebrow: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { flexShrink: 1, color: theme.ink, fontFamily: theme.font.display, fontSize: 20, letterSpacing: -0.4 },
  rating: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.ink, fontFamily: theme.font.monoHeavy, fontSize: 13 },
  line: { color: theme.ink, fontFamily: theme.font.semibold, fontSize: 13 },
  faded: { opacity: 0.7 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(14,14,20,0.12)', color: theme.ink, fontFamily: theme.font.bold, fontSize: 12 },
  reveal: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.ink },
  revealText: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 12 },
  confirm: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: theme.ink },
  solve: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: theme.ink },
  solveText: { color: theme.lime, fontFamily: theme.font.bold, fontSize: 15 },
});
