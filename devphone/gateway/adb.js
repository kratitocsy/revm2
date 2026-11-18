// Thin wrapper over the adb binary. Every device action the gateway performs goes through here.
import { execFile } from 'node:child_process';

const ADB = process.env.ADB || 'adb';

export class Adb {
  constructor(serial) {
    this.serial = serial;
  }

  /** Runs `adb [-s serial] ...args` and resolves stdout as a Buffer. */
  run(args, { timeout = 20000, serial = true } = {}) {
    const full = serial && this.serial ? ['-s', this.serial, ...args] : args;
    return new Promise((resolve, reject) => {
      execFile(ADB, full, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout }, (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr && stderr.toString().trim()) || err.message;
          reject(new Error(`adb ${args.join(' ')}: ${msg}`));
        } else resolve(stdout);
      });
    });
  }

  async text(args, opts) {
    return (await this.run(args, opts)).toString('utf8');
  }

  /** `adb connect` for network devices such as redroid (host:port serials). */
  async connect() {
    if (!this.serial || !this.serial.includes(':')) return;
    await this.text(['connect', this.serial], { serial: false, timeout: 8000 });
  }

  async isOnline() {
    try {
      return (await this.text(['get-state'], { timeout: 5000 })).trim() === 'device';
    } catch {
      return false;
    }
  }

  screenshot() {
    return this.run(['exec-out', 'screencap', '-p']);
  }

  async uiXml() {
    const out = await this.text(['exec-out', 'uiautomator', 'dump', '/dev/tty'], { timeout: 30000 });
    const start = out.indexOf('<?xml');
    const end = out.lastIndexOf('</hierarchy>');
    if (start < 0 || end < 0) throw new Error('uiautomator returned no hierarchy: ' + out.slice(0, 200));
    return out.slice(start, end + '</hierarchy>'.length);
  }

  /** `adb shell` joins its arguments into one remote sh command, so every argument is quoted here. */
  shell(...args) {
    return this.text(['shell', args.map(shq).join(' ')]);
  }

  tap(x, y) {
    return this.shell('input', 'tap', String(Math.round(x)), String(Math.round(y)));
  }

  swipe(x1, y1, x2, y2, ms = 300) {
    return this.shell('input', 'swipe', ...[x1, y1, x2, y2, ms].map(v => String(Math.round(v))));
  }

  /** `input text` reads %s as a space. */
  type(text) {
    return this.shell('input', 'text', text.replace(/%/g, '%%').replace(/ /g, '%s'));
  }

  key(code) {
    return this.shell('input', 'keyevent', String(code));
  }

  install(apkPath) {
    return this.text(['install', '-r', '-g', apkPath], { timeout: 180000 });
  }

  launch(pkg) {
    return this.shell('monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1');
  }

  stop(pkg) {
    return this.shell('am', 'force-stop', pkg);
  }

  logcat(lines, level) {
    const args = ['logcat', '-d', '-t', String(lines)];
    if (level) args.push(`*:${level}`);
    return this.text(args, { timeout: 15000 });
  }

  async foregroundPackage() {
    try {
      const out = await this.shell('dumpsys', 'activity', 'activities');
      const m = out.match(/(?:mResumedActivity|topResumedActivity)[^\n]*?\s([\w.]+)\/[\w.$]+/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }
}

export function shq(s) {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

export const KEYCODES = {
  home: 3, back: 4, call: 5, endcall: 6, up: 19, down: 20, left: 21, right: 22, power: 26,
  camera: 27, tab: 61, space: 62, enter: 66, delete: 67, menu: 82, search: 84, recents: 187,
  volume_up: 24, volume_down: 25, escape: 111, app_switch: 187,
};
