import { sb } from './supabaseClient';
import { REVM2_CONFIG } from '../../lib/supabase.js';

/* Saved blocks, schedules and the planner store friendly app names
   ("Instagram", "VS Code"), but the desktop app can only close real process
   names ("Code.exe"). Before the list goes to set_blocked_apps, any name that
   doesn't already line up with a running process is sent to the resolve_apps mode of ai-generate-schedule,
   which picks matching names from this computer's own process list. Names it
   can't place are passed through untouched (the desktop app still does its
   own loose matching on them). Each name is asked about once per page load. */

const norm = (s: string) => s.trim().toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '');
const lines = (e: string, p: string) => !!e && !!p && (e === p || (e.length >= 5 && p.startsWith(e)));

const resolved = new Map<string, string[]>();

export async function resolveDeviceApps(names: string[]): Promise<string[]> {
  const tauri = (window as any).__TAURI__;
  if (!tauri?.core || !names.length) return names;
  try {
    const running: string[] = ((await tauri.core.invoke('list_running_apps')) || []).map((a: { name: string }) => a.name);
    const runningNorm = running.map(norm);
    const unknown = names.filter(
      (n) => !resolved.has(n) && !runningNorm.some((p) => lines(norm(n), p)),
    );
    if (unknown.length && running.length) {
      let matches: Record<string, string[]> = {};
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          const res = await fetch(`${REVM2_CONFIG.SUPABASE_URL}/functions/v1/ai-generate-schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ mode: 'resolve_apps', names: unknown, device_apps: running }),
          });
          if (res.ok) matches = (await res.json()).matches || {};
        }
      } catch { /* fall through: unresolved names stay as they are */ }
      for (const n of unknown) resolved.set(n, matches[n] || []);
    }
    return [...new Set(names.flatMap((n) => [n, ...(resolved.get(n) || [])]))];
  } catch {
    return names;
  }
}
