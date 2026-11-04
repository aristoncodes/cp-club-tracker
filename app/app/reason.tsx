import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { Button } from '../lib/ui';
import { theme } from '../theme';

const REASONS = [
  { id: 'exams', label: 'Exams' },
  { id: 'travel', label: 'Travel' },
  { id: 'illness', label: 'Illness' },
  { id: 'clash', label: 'Other commitment' },
  { id: 'forgot', label: 'Forgot' },
  { id: 'other', label: 'Other' },
];

export default function Reason() {
  const { contestId, rsvp } = useLocalSearchParams<{ contestId: string; rsvp?: string }>();
  const [reasonType, setReasonType] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (reasonType === 'other' && !reasonText.trim()) return setError('Please say a little about the reason.');
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
      <Text style={styles.title}>What got in the way?</Text>
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
        placeholder={reasonType === 'other' ? 'Tell us a little more' : 'Anything to add? (optional)'}
        placeholderTextColor={theme.muted}
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Submit" onPress={submit} disabled={!reasonType || saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16, paddingTop: 64, gap: 16 },
  title: { color: theme.text, fontFamily: theme.font.bold, fontSize: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
  },
  chipSelected: { borderColor: theme.accent },
  chipText: { color: theme.text, fontFamily: theme.font.regular, fontSize: 14 },
  chipTextSelected: { color: theme.accent },
  input: {
    color: theme.text,
    backgroundColor: theme.surface2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 96,
    padding: 12,
    fontFamily: theme.font.regular,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  error: { color: theme.absent, fontFamily: theme.font.regular, fontSize: 14 },
});
