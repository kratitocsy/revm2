import { useEffect, useState } from 'react'
import { EXTENSION_STORE_URL, shouldOfferExtensionInstall } from './lib/extensionConnect'

/* One-time popup for a signed-in student on desktop Chrome who doesn't have
   the Wynko Focus Lock extension yet: "Add to Chrome" opens its Chrome Web
   Store page. Dismissing it (or installing) means it isn't shown again in
   this browser. The extension pairs itself on the next dashboard load
   (autoConnectExtension). */

const SEEN_KEY = 'wynko_ext_prompt_seen'

function seen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1') } catch { /* prompt just shows again */ }
}

export default function ExtensionInstallPrompt() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (seen()) return
    let live = true
    void shouldOfferExtensionInstall().then(offer => { if (live && offer) setOpen(true) })
    return () => { live = false }
  }, [])

  if (!open) return null
  const close = () => { markSeen(); setOpen(false) }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-[rgba(0,0,0,0.75)]"
      onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div role="dialog" aria-modal="true" aria-label="Add Wynko Focus Lock to Chrome"
        className="rounded-2xl border p-7 w-[400px] max-w-[92vw]"
        style={{ background: '#161618', borderColor: '#3A3A3A' }}>
        <div className="text-[10px] text-wk-orange-300 font-mono tracking-[0.2em] mb-1.5">ONE MORE STEP</div>
        <div className="text-lg font-semibold text-wk-ink-100 mb-2">Add Wynko Focus Lock to Chrome</div>
        <p className="text-[13px] text-wk-ink-300 mb-5">
          Your account is ready. Install the free extension so distracting sites stay blocked during your
          study sessions and schedules. It connects to your account automatically.
        </p>
        <div className="flex gap-3">
          <a href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={close}
            className="flex-1 text-center rounded-xl px-4 py-2.5 text-[14px] font-semibold text-black bg-wk-orange-500 hover:opacity-90">
            Add to Chrome
          </a>
          <button onClick={close}
            className="rounded-xl px-4 py-2.5 text-[14px] text-wk-ink-300 border border-[#3A3A3A] hover:text-wk-ink-100">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
