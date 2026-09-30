import { useEffect, useState } from 'react'
import { sb } from '../../_shared/supabaseClient'
import { loadMemory, loadEvents, forgetFacts, examFamilyKey } from './wynkyPlanner'
import { memoryLines, standingRequests } from './wynkyRefine'

/* "What Wynky remembers" under Settings > Privacy: the facts and rules the
   Wynky chat picked up (wynky_memory, migration 0101) plus requests typed
   before that table existed. Each can be deleted; deleting is logged to
   wynky_events like every other change, so the archived history stays
   complete. */

interface Item { fact: string; kind: 'fact' | 'rule' }

export default function WynkyMemorySettings({ userId, exam, notify }: { userId: string; exam: string; notify: (msg: string, ok?: boolean) => void }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [memory, events] = await Promise.all([loadMemory(sb as any, userId), loadEvents(sb as any, userId).catch(() => [])])
      if (cancelled) return
      const kinds = new Map(memory.map(m => [m.fact.trim().toLowerCase(), m.kind]))
      setItems(memoryLines(memory.map(m => m.fact), standingRequests(events, 40), 100)
        .map(fact => ({ fact, kind: kinds.get(fact.toLowerCase()) ?? 'rule' })))
    })()
    return () => { cancelled = true }
  }, [userId])

  async function forget(facts: string[], key: string) {
    if (busy || !facts.length) return
    setBusy(key)
    try {
      await forgetFacts(sb as any, userId, { examKey: examFamilyKey(exam || null), dayType: null }, facts)
      const gone = new Set(facts.map(f => f.trim().toLowerCase()))
      setItems(list => (list || []).filter(i => !gone.has(i.fact.trim().toLowerCase())))
      notify(facts.length > 1 ? '✓ Wynky forgot everything' : '✓ Wynky forgot that')
    } catch (err) {
      notify((err as Error).message || 'Could not delete that', false)
    } finally {
      setBusy(null)
    }
  }

  if (!items) return <div className="py-3.5 text-[11px] text-wk-ink-500">Loading…</div>
  if (!items.length) return <div className="py-3.5 text-[11px] text-wk-ink-500">Nothing yet. What you tell Wynky about your routine and how you like to study shows up here.</div>
  return (
    <>
      {items.map(i => (
        <div key={i.fact} className="flex items-center justify-between gap-3 py-3 border-b border-[rgba(38,38,42,0.55)]">
          <div className="min-w-0">
            <div className="text-sm text-wk-ink-200 break-words">{i.fact}</div>
            <div className="text-[10px] text-wk-ink-600 font-mono mt-0.5">{i.kind === 'rule' ? 'RULE FOR YOUR PLANS' : 'ABOUT YOU'}</div>
          </div>
          <button onClick={() => void forget([i.fact], i.fact)} disabled={!!busy}
            className="px-3 py-1.5 rounded-xl border text-[11px] font-semibold text-wk-ink-400 hover:text-red-300 hover:border-red-400/40 transition-all border-[#3A3A3A] disabled:opacity-50 flex-shrink-0">
            {busy === i.fact ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ))}
      <div className="flex justify-end py-3">
        <button onClick={() => { if (window.confirm('Delete everything Wynky remembers about you?')) void forget(items.map(i => i.fact), '*') }} disabled={!!busy}
          className="px-3.5 py-1.5 rounded-xl border text-[11px] font-semibold text-red-300 hover:border-red-400/50 transition-all border-[#3A3A3A] disabled:opacity-50">
          {busy === '*' ? 'Deleting…' : 'Forget all'}
        </button>
      </div>
    </>
  )
}
