import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { duelName, formatClock, type DuelView } from 'shared/duel';
import { theme } from '../theme';
import { api } from './api';
import { Avatar, Button, common } from './ui';

const INVITE_LIFE = 600;

export function InviteCard({ duel, myId, now, onChange, onOpen }: { duel: DuelView; myId: number; now: number; onChange: () => void; onOpen: (id: number) => void }) {
  const [error, setError] = useState('');
  const incoming = duel.opponentId === myId;
  const name = incoming ? duelName(duel.challengerUsername, duel.challengerName) : duelName(duel.opponentUsername, duel.opponentName);

  async function act(action: 'accept' | 'decline') {
    setError('');
    try {
      await api(`/duels/${duel.id}/${action}`, 'POST');
      if (action === 'accept') onOpen(duel.id);
      else onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer the invite.');
    }
  }

  return (
    <View style={styles.card}>
      <View style={common.row}>
        <Avatar userId={incoming ? duel.challengerId : duel.opponentId} name={incoming ? duel.challengerName : duel.opponentName} />
        <View style={styles.main}>
          <Text style={styles.title}>{incoming ? `${name} challenged you` : `Waiting for ${name}`}</Text>
          <Text style={styles.detail}>{duel.ratingMin}–{duel.ratingMax} · {duel.minutes} min · expires in {formatClock(duel.createdAt + INVITE_LIFE - now)}</Text>
        </View>
      </View>
      <View style={common.row}>
        <Button title={incoming ? 'Decline' : 'Cancel'} flex variant="secondary" onPress={() => act('decline')} />
        {incoming ? (
          <Pressable accessibilityRole="button" style={styles.accept} onPress={() => act('accept')}>
            <Text style={styles.acceptText}>Accept</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={common.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.pinkLine, backgroundColor: theme.pinkTint },
  main: { flex: 1 },
  title: { color: theme.pinkSoft, fontFamily: theme.font.bold, fontSize: 14 },
  detail: { color: theme.pinkText, fontFamily: theme.font.monoBold, fontSize: 12 },
  accept: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: theme.pink },
  acceptText: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 15 },
});
