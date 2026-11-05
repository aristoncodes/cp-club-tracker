import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { REASONS } from 'shared/reasons';
import { api } from '../lib/api';
import { Button, ScreenHeader } from '../lib/ui';
import { theme } from '../theme';

export default function Reason() {
  const { contestId, rsvp } = useLocalSearchParams<{ contestId: string; rsvp?: string }>();
  const [reasonType, setReasonType] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (reasonType === 'other' && !reasonText.trim()) return setError('Please add a few details about the reason.');
    setError('');
    setSaving(true);
    try {
      if (rsvp) {
        await api(`/contests/${contestId}/rsvp`, 'POST', { going: false, reasonType, reasonText });
      } else {
        await api(`/contests/${contestId}/reason`, 'POST', { reasonType, reasonText });
      }
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Reason" />
      <Text style={styles.title}>Why did you miss this contest?</Text>
      <View style={styles.chips}>
        {REASONS.map(({ id, label }) => {
          const selected = reasonType === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setReasonType(id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        style={styles.input}
        value={reasonText}
        onChangeText={setReasonText}
        placeholder={reasonType === 'other' ? 'Please add a few details' : 'Additional details (optional)'}
        placeholderTextColor={theme.muted}
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Submit" onPress={submit} disabled={!reasonType || saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: theme.gutter, paddingTop: 64, gap: 16 },
  title: { color: theme.text, fontFamily: theme.font.display, fontSize: 30, letterSpacing: -0.9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderColor: theme.line, borderWidth: 2 },
  chipSelected: { backgroundColor: theme.sun, borderColor: theme.sun },
  chipText: { color: theme.text, fontFamily: theme.font.bold, fontSize: 14 },
  chipTextSelected: { color: theme.ink },
  input: {
    color: theme.text,
    backgroundColor: theme.card,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 96,
    padding: 14,
    fontFamily: theme.font.regular,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  error: { color: theme.pink, fontFamily: theme.font.regular, fontSize: 14 },
});
