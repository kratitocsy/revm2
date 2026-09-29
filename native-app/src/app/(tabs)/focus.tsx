import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  isLockingAvailable,
  WynkoLocking,
  type InstalledApp,
  type LockPermissions,
  type SessionState,
} from '../../../modules/wynko-locking';
import { Card, Screen } from '../../components/Screen';
import { colors } from '../../lib/theme';

const PERMISSION_STEPS: { key: keyof LockPermissions; label: string; request: () => Promise<void> }[] = [
  { key: 'accessibility', label: 'Detect blocked apps', request: WynkoLocking.requestAccessibility },
  { key: 'overlay', label: 'Show the block screen', request: WynkoLocking.requestOverlay },
  { key: 'vpn', label: 'Block websites', request: WynkoLocking.requestVpn },
  { key: 'deviceAdmin', label: 'Uninstall protection', request: WynkoLocking.requestDeviceAdmin },
  { key: 'usageAccess', label: 'Screen-time stats', request: WynkoLocking.requestUsageAccess },
];

/**
 * Wiring check for the native blocking module: permissions, the installed-app
 * picker, and a local start/stop. Real sessions will be created in
 * focus_lock_sessions first, the way blocks.html does it, then mirrored here.
 */
export default function Focus() {
  const [perms, setPerms] = useState<LockPermissions | null>(null);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<SessionState | null>(null);

  const refresh = useCallback(async () => {
    if (!isLockingAvailable) return;
    setPerms(await WynkoLocking.checkLockPermissions());
    setState(await WynkoLocking.getSessionState());
  }, []);

  useEffect(() => {
    if (!isLockingAvailable) return;
    refresh();
    WynkoLocking.listInstalledApps().then((r) =>
      setApps(r.apps.sort((a, b) => a.label.localeCompare(b.label)))
    );
    // Permissions are granted in system Settings, so re-check on return.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  if (!isLockingAvailable) {
    return (
      <Screen title="Focus Lock">
        <Card>
          <Text style={styles.body}>
            App blocking runs in the Android development build. iOS blocking needs Apple's Screen
            Time entitlement first (see native-app/README.md).
          </Text>
        </Card>
      </Screen>
    );
  }

  const toggle = (pkg: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });

  return (
    <Screen title="Focus Lock">
      <Card>
        <Text style={styles.heading}>Permissions</Text>
        {PERMISSION_STEPS.map((step) => (
          <View key={step.key} style={styles.row}>
            <Text style={styles.body}>{step.label}</Text>
            {perms?.[step.key] ? (
              <Text style={styles.ok}>On</Text>
            ) : (
              <Pressable onPress={step.request}>
                <Text style={styles.link}>Turn on</Text>
              </Pressable>
            )}
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.heading}>
          {state?.active ? 'Session running' : `Block ${picked.size} app${picked.size === 1 ? '' : 's'}`}
        </Text>
        <Pressable
          style={[styles.button, state?.active && styles.stop]}
          onPress={async () => {
            if (state?.active) await WynkoLocking.endSession();
            else
              await WynkoLocking.setBlockListAndStart({
                sessionId: `local-test-${Date.now()}`,
                appsMode: 'blacklist',
                apps: [...picked],
              });
            refresh();
          }}
        >
          <Text style={styles.buttonText}>{state?.active ? 'End test session' : 'Start test session'}</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={styles.heading}>Installed apps</Text>
        {apps.map((app) => (
          <View key={app.packageName} style={styles.row}>
            <Text style={styles.body} numberOfLines={1}>
              {app.label}
            </Text>
            <Switch
              value={picked.has(app.packageName)}
              onValueChange={() => toggle(app.packageName)}
              trackColor={{ true: colors.violet }}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.white, fontSize: 17, fontWeight: '600' },
  body: { color: colors.text, fontSize: 15, flexShrink: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  ok: { color: colors.success, fontWeight: '600' },
  link: { color: colors.violetBright, fontWeight: '600' },
  button: { backgroundColor: colors.violet, borderRadius: 12, padding: 14, alignItems: 'center' },
  stop: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontWeight: '600' },
});
