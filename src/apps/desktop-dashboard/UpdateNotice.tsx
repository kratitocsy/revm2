import { useEffect, useState } from 'react'

/* The dashboard bundle keeps one file name, so a window that stays open (the
   desktop app especially) never picks up a new deploy by itself. This checks
   the bundle's version now and then and offers a reload when it changed.
   The desktop app's X button only hides it to the tray, so when the window
   comes back after being hidden a while, it reloads on its own (the student
   has just returned, so nothing is in progress). A window that stays open
   reloads on its own once it has been idle for IDLE_MS; until then the bar
   lets the student update right away. */

const BUNDLE = '/home-app-dist/home-app.js'
const CHECK_MS = 5 * 60 * 1000
const AWAY_MS = 2 * 60 * 1000
const IDLE_MS = 5 * 60 * 1000

async function bundleVersion(): Promise<string | null> {
  try {
    const res = await fetch(BUNDLE, { method: 'HEAD', cache: 'no-store' })
    if (!res.ok) return null
    return res.headers.get('etag') || res.headers.get('last-modified') || res.headers.get('content-length')
  } catch {
    return null
  }
}

export default function UpdateNotice() {
  const [ready, setReady] = useState(false)
  const [later, setLater] = useState(false)

  useEffect(() => {
    let base: string | null = null
    let stopped = false
    let hiddenAt: number | null = null
    let changed = false
    let lastInput = Date.now()
    const idle = () => Date.now() - lastInput >= IDLE_MS
    const check = async (reloadIfNew = false) => {
      const now = await bundleVersion()
      if (stopped || !now) return
      if (base === null) base = now
      else if (now !== base) {
        changed = true
        if (reloadIfNew || idle()) window.location.reload()
        else setReady(true)
      }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, CHECK_MS)
    // Once a new version is known, reload as soon as the student goes idle.
    const idleTimer = window.setInterval(() => { if (changed && idle()) window.location.reload() }, 30_000)
    const onInput = () => { lastInput = Date.now() }
    const inputs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    inputs.forEach(e => window.addEventListener(e, onInput, { passive: true }))
    const onFocus = () => { void check() }
    const onVisible = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      const away = hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS
      hiddenAt = null
      void check(away)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.clearInterval(idleTimer)
      inputs.forEach(e => window.removeEventListener(e, onInput))
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!ready || later) return null
  return (
    <div role="status" className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-xl border border-wk-black-600 bg-wk-black-700 px-4 py-3 text-[13px] text-wk-ink-100 shadow-lg">
      <span>A new version of Wynko is ready.</span>
      <button type="button" onClick={() => window.location.reload()}
        className="rounded-lg bg-wk-orange-500 px-3 py-1 font-semibold text-wk-black-950">
        Update now
      </button>
      <button type="button" onClick={() => setLater(true)} className="text-wk-ink-400 hover:text-wk-ink-100">
        Later
      </button>
    </div>
  )
}
