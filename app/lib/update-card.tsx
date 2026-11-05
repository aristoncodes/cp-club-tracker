import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { AppState, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { appVersionAction } from 'shared/app-version';
import { istDay } from 'shared/time';
import { theme } from '../theme';
import { ProgressBar, Button, common } from './ui';

type AppVersion = { latest: string; min: string; url: string; notes: string; web: string };
type Release = { version?: string; notes?: string };
type UpdateManifest = { extra?: { expoClient?: { extra?: { release?: Release } } } };

const LAST_UPDATE_KEY = 'last-update-id';
const SHEET_DAY_KEY = 'apk-sheet-day';
const icon = require('../assets/icon.png');

async function downloadUpdate(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  const { isAvailable } = await Updates.checkForUpdateAsync();
  if (isAvailable) await Updates.fetchUpdateAsync();
}

function useForegroundCheck(check: () => void): void {
  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => subscription.remove();
  }, []);
}

function Restarting({ version }: { version?: string }) {
  return (
    <Modal transparent={false} animationType="none">
      <View style={styles.splash}>
        <Image source={icon} style={styles.logo} />
        <View style={styles.splashBar}><ProgressBar percent={70} /></View>
        <Text style={styles.splashText}>Updating{version ? ` to version ${version}` : ''}…</Text>
      </View>
    </Modal>
  );
}

function UpdateCard() {
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const [later, setLater] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [updated, setUpdated] = useState<Release | null>(null);
  const version = (downloadedUpdate?.manifest as UpdateManifest | undefined)?.extra?.expoClient?.extra?.release?.version;

  useForegroundCheck(() => {
    downloadUpdate().catch(console.warn);
  });

  // The first launch of a build only records its id; a later change of id means an update just arrived.
  useEffect(() => {
    if (!Updates.updateId) return;
    SecureStore.getItemAsync(LAST_UPDATE_KEY)
      .then(async (last) => {
        if (last && last !== Updates.updateId) setUpdated((Constants.expoConfig?.extra?.release as Release | undefined) ?? {});
        await SecureStore.setItemAsync(LAST_UPDATE_KEY, Updates.updateId!);
      })
      .catch(console.warn);
  }, []);

  function restart() {
    setRestarting(true);
    Updates.reloadAsync().catch((err) => {
      console.warn(err);
      setRestarting(false);
    });
  }

  if (restarting) return <Restarting version={version} />;
  return (
    <>
      {updated ? (
        <View style={styles.updated}>
          <View style={styles.main}>
            <Text style={styles.updatedTitle}>✓ Updated{updated.version ? ` to version ${updated.version}` : ''}</Text>
            {updated.notes ? <Text style={common.small}>{updated.notes}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={() => setUpdated(null)}>
            <Feather name="x" size={20} color={theme.text} />
          </Pressable>
        </View>
      ) : null}
      {isUpdatePending && later ? (
        <Pressable accessibilityRole="button" style={styles.pill} hitSlop={8} onPress={restart}>
          <Text style={styles.pillText}>Update</Text>
        </Pressable>
      ) : null}
      {isUpdatePending && !later ? (
        <View style={styles.card}>
          <View style={common.row}>
            <View style={styles.tile}><Feather name="refresh-cw" size={20} color={theme.ink} /></View>
            <View style={styles.main}>
              <Text style={common.bold}>Update ready</Text>
              <Text style={common.small}>Restarting takes 2 seconds.</Text>
            </View>
          </View>
          <View style={common.row}>
            <View style={styles.later}><Button title="Later" variant="secondary" onPress={() => setLater(true)} /></View>
            <View style={styles.restart}><Button title="Restart to update" onPress={restart} /></View>
          </View>
        </View>
      ) : null}
    </>
  );
}

function ApkPrompt() {
  const [info, setInfo] = useState<AppVersion | null>(null);
  const [action, setAction] = useState<'none' | 'optional' | 'required'>('none');
  const current = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '0';

  useForegroundCheck(() => {
    (async () => {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/app-version`);
      const latest: AppVersion = await response.json();
      const next = appVersionAction(current, latest.latest, latest.min);
      const today = String(istDay(Date.now() / 1000));
      if (next === 'optional') {
        if ((await SecureStore.getItemAsync(SHEET_DAY_KEY)) === today) return;
        await SecureStore.setItemAsync(SHEET_DAY_KEY, today);
      }
      setInfo(latest);
      setAction(next);
    })().catch(console.warn);
  });

  if (!info || action === 'none') return null;
  if (action === 'required') {
    return (
      <Modal transparent={false} animationType="none" onRequestClose={() => undefined}>
        <View style={styles.required}>
          <View style={styles.requiredTile}><Feather name="download" size={40} color={theme.ink} /></View>
          <Text style={common.title}>Please update the app</Text>
          <Text style={common.muted}>This version can't talk to the club's server any more.{info.notes ? ` ${info.notes}` : ''}</Text>
          {['Download the new version.', 'Open the file and tap Install.', 'Open the app. You stay signed in.'].map((step, index) => (
            <View key={step} style={common.row}>
              <Text style={styles.step}>{index + 1}</Text>
              <Text style={common.text}>{step}</Text>
            </View>
          ))}
          <Button title={`Download version ${info.latest}`} onPress={() => Linking.openURL(info.url)} />
          <Button title="Or open the website meanwhile" variant="secondary" onPress={() => Linking.openURL(info.web)} />
        </View>
      </Modal>
    );
  }
  return (
    <Modal transparent animationType="slide" onRequestClose={() => setAction('none')}>
      <View style={styles.dim}>
        <View style={styles.sheet}>
          <View style={common.row}>
            <Image source={icon} style={styles.sheetIcon} />
            <View style={styles.main}>
              <Text style={common.heading}>New app version</Text>
              <Text style={common.small}>Version {info.latest} · you have {current}</Text>
            </View>
          </View>
          {info.notes ? (
            <View style={styles.notes}>
              <Text style={common.label}>WHAT'S NEW</Text>
              <Text style={common.text}>{info.notes}</Text>
            </View>
          ) : null}
          <Text style={common.small}>Open the file once it's downloaded, then tap Install.</Text>
          <Button title="Download update" onPress={() => Linking.openURL(info.url)} />
          <Button title="Not now" variant="secondary" onPress={() => setAction('none')} />
        </View>
      </View>
    </Modal>
  );
}

export function UpdatePrompts() {
  return (
    <>
      <UpdateCard />
      <ApkPrompt />
    </>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1 },
  card: { position: 'absolute', left: theme.gutter, right: theme.gutter, bottom: 96, gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.lime },
  later: { flex: 1 },
  restart: { flex: 2 },
  pill: { position: 'absolute', top: 20, alignSelf: 'center', minHeight: 32, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: theme.lime },
  pillText: { color: theme.ink, fontFamily: theme.font.bold, fontSize: 13 },
  updated: { position: 'absolute', left: theme.gutter, right: theme.gutter, bottom: 96, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.limeLine, backgroundColor: theme.limeTint },
  updatedTitle: { color: theme.lime, fontFamily: theme.font.bold, fontSize: 14 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40, backgroundColor: theme.violet },
  logo: { width: 80, height: 80, borderRadius: 22, transform: [{ rotate: '-6deg' }] },
  splashBar: { alignSelf: 'stretch' },
  splashText: { color: theme.white, fontFamily: theme.font.bold, fontSize: 15 },
  required: { flex: 1, justifyContent: 'center', gap: 16, padding: theme.gutter, backgroundColor: theme.ink },
  requiredTile: { width: 88, height: 88, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.sun, transform: [{ rotate: '-6deg' }] },
  step: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', textAlign: 'center', lineHeight: 28, backgroundColor: theme.card2, color: theme.text, fontFamily: theme.font.monoHeavy },
  dim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,14,20,0.7)' },
  sheet: { gap: 12, padding: theme.gutter, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: theme.card },
  sheetIcon: { width: 48, height: 48, borderRadius: 14 },
  notes: { gap: 4, padding: 12, borderRadius: 14, backgroundColor: theme.card2 },
});
