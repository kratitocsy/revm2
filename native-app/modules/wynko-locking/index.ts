import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * On-device Focus Lock enforcement. Same API as the Capacitor app's
 * `Capacitor.Plugins.RevM2Locking`, so session logic ports across as-is.
 *
 * Android only for now. iOS needs a separate Screen Time (FamilyControls)
 * implementation with a different shape: Apple never exposes installed
 * app names, only opaque tokens from its own picker. See README.md.
 */

export type LockPermissions = {
  accessibility: boolean;
  overlay: boolean;
  vpn: boolean;
  deviceAdmin: boolean;
};

export type InstalledApp = { packageName: string; label: string };

export type StartOptions = {
  sessionId: string;
  noEarlyUnlock?: boolean;
  appsMode?: 'blacklist' | 'whitelist';
  unlockPhrase?: string | null;
  apps?: string[];
  domains?: string[];
};

export type SessionState = {
  active: boolean;
  sessionId: string | null;
  noEarlyUnlock: boolean;
};

type NativeModule = {
  listInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  checkLockPermissions(): Promise<LockPermissions>;
  requestAccessibility(): Promise<void>;
  requestOverlay(): Promise<void>;
  requestVpn(): Promise<void>;
  requestDeviceAdmin(): Promise<void>;
  setBlockListAndStart(options: StartOptions): Promise<void>;
  endSession(unlockPhrase: string | null): Promise<void>;
  getSessionState(): Promise<SessionState>;
};

// Null in Expo Go and on iOS/web, where the module isn't compiled in.
const native = requireOptionalNativeModule<NativeModule>('WynkoLocking');

export const isLockingAvailable = Platform.OS === 'android' && native != null;

function need(): NativeModule {
  if (!native) throw new Error('Focus Lock needs the Android dev build (not Expo Go)');
  return native;
}

export const WynkoLocking = {
  listInstalledApps: () => need().listInstalledApps(),
  checkLockPermissions: () => need().checkLockPermissions(),
  requestAccessibility: () => need().requestAccessibility(),
  requestOverlay: () => need().requestOverlay(),
  requestVpn: () => need().requestVpn(),
  requestDeviceAdmin: () => need().requestDeviceAdmin(),
  setBlockListAndStart: (options: StartOptions) => need().setBlockListAndStart(options),
  endSession: (unlockPhrase: string | null = null) => need().endSession(unlockPhrase),
  getSessionState: () => need().getSessionState(),
};
