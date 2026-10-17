import { useCallback, useEffect, useState } from 'react'

/* Android app only (the app hosts this dashboard in a WebView and exposes the blocking bridge as
   Capacitor.Plugins.RevM2Locking, the same one blocks.html uses). Shows which permissions blocking
   still needs and opens the right system screen for each. Renders nothing in a browser, in the
   desktop app, or once everything is granted. */

type Status = Partial<Record<'accessibility' | 'overlay' | 'vpn' | 'deviceAdmin', boolean>>

const PERMS: { key: keyof Status; label: string; method: string; desc: string }[] = [
  { key: 'accessibility', label: 'Detect blocked apps', method: 'requestAccessibility', desc: 'Lets Wynko see which app is in front so it can show the block screen over a blocked one.' },
  { key: 'overlay', label: 'Show block screen', method: 'requestOverlay', desc: 'Draws the block screen over a blocked app. Without it, blocked apps are detected but not covered.' },
  { key: 'vpn', label: 'Block websites', method: 'requestVpn', desc: 'A local, on-device VPN that stops blocked sites from loading. Nothing is sent to a server.' },
  { key: 'deviceAdmin', label: 'Uninstall resistance (optional)', method: 'requestDeviceAdmin', desc: 'Makes leaving mid-session a deliberate extra step. You can turn it off any time in Settings.' },
]

function plugin(): any {
  const w = window as any
  return w.Capacitor?.isNativePlatform?.() ? w.Capacitor?.Plugins?.RevM2Locking : null
}

export default function NativeBlockingCard() {
  const [status, setStatus] = useState<Status | null>(null)

  const refresh = useCallback(async () => {
    const p = plugin()
    if (!p) return
    try { setStatus((await p.checkLockPermissions()) || {}) } catch { /* bridge unavailable: stay hidden */ }
  }, [])

  useEffect(() => {
    void refresh()
    // The system settings screens open over the app; re-check when the person comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible) }
  }, [refresh])

  if (!status) return null
  const required = PERMS.filter(p => p.key !== 'deviceAdmin')
  if (required.every(p => status[p.key])) return null

  return (
    <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,138,61,0.07)', borderColor: 'rgba(255,138,61,0.35)' }}>
      <div className="text-[13px] font-bold text-white">Turn on blocking</div>
      <div className="text-[11px] text-wk-ink-500 mt-0.5 mb-2">Wynko needs these to block apps and sites during a focus session. Each opens an Android screen where you allow it.</div>
      {PERMS.map(p => (
        <div key={p.key} className="flex items-center gap-3 py-2 border-t" style={{ borderColor: 'rgba(38,38,42,0.8)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-wk-ink-100">{p.label} {status[p.key] ? <span style={{ color: '#10B981' }}>✓</span> : null}</div>
            <div className="text-[10.5px] text-wk-ink-500 leading-snug">{p.desc}</div>
          </div>
          {!status[p.key] && (
            <button
              onClick={async () => { try { await plugin()?.[p.method]?.() } finally { setTimeout(refresh, 1500) } }}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-black flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#FFC773,#FF8A3D)' }}>
              Enable
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
