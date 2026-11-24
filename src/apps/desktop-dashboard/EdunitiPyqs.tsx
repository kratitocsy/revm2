import { useEffect, useState } from 'react'
import { MockTestPanel } from './PyqTest'
import { PyqUpload } from './PyqUpload'
import { deleteSet, listSets, toPyqSet } from './lib/pyqStore'
import { loadActive } from './lib/pyqTest'
import { PYQ_SETS, type PyqSet } from './lib/edunitiPyqs'

// The "Eduniti Top PYQs" page body. DesktopDashboard wraps it with the sidebar.
// The page is a full mock test on the questions of an Eduniti challenge PDF.
// The credit and the link to the video solutions stay visible.

type LoadedSet = PyqSet & { release?: () => void }

export function EdunitiPyqsContent({ candidateName }: { candidateName?: string | null } = {}) {
  const [set, setSet] = useState<PyqSet>(PYQ_SETS[0])
  const [uploaded, setUploaded] = useState<LoadedSet[]>([])
  const [uploading, setUploading] = useState(false)
  const allSets: PyqSet[] = [...PYQ_SETS, ...uploaded]

  // Sets the student imported earlier live in this browser. A test left running
  // on one of them opens straight back into it.
  useEffect(() => {
    let alive = true
    const made: LoadedSet[] = []
    void listSets().then(stored => {
      if (!alive) return
      for (const st of stored) made.push(toPyqSet(st))
      setUploaded(made)
      const a = loadActive()
      const target = a && a.submittedAt === null ? made.find(x => x.id === a.setId) : undefined
      if (target) setSet(target)
    })
    return () => { alive = false; for (const m of made) m.release?.() }
  }, [])

  async function removeUploaded(target: LoadedSet) {
    if (!window.confirm(`Delete "${target.title}" from this device? Your test history for it goes too.`)) return
    await deleteSet(target.id).catch(() => undefined)
    target.release?.()
    setUploaded(u => u.filter(x => x.id !== target.id))
    setSet(PYQ_SETS[0])
  }

  const navItem = (active: boolean) => ({
    background: active ? 'rgba(255,138,61,0.14)' : 'transparent',
    borderColor: active ? 'rgba(255,138,61,0.6)' : 'transparent',
    color: active ? '#FFF7E6' : '#CFC8BB',
  })
  const builtIn = allSets.filter(s => !s.uploaded)
  const mine = allSets.filter(s => s.uploaded)

  const setButton = (s: PyqSet) => {
    const on = s.id === set.id && !uploading
    return (
      <button key={s.id} onClick={() => { setSet(s); setUploading(false) }} aria-current={on}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold text-left max-md:w-auto max-md:flex-shrink-0 max-md:py-2"
        style={navItem(on)}>
        <span className="flex-1 truncate">{s.title}</span>
        <span className="max-md:hidden" style={{ color: '#7A756D' }}>›</span>
      </button>
    )
  }
  const heading = (t: string) => (
    <div className="flex items-center gap-3 px-2 mt-5 mb-2 max-md:hidden">
      <span className="text-[11px] font-mono tracking-widest whitespace-nowrap" style={{ color: '#9C968C' }}>{t}</span>
      <span className="flex-1 border-t border-dashed" style={{ borderColor: '#3A3A3A' }} />
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto w-full flex gap-8 max-md:flex-col max-md:gap-4">
      <aside className="w-64 flex-shrink-0 max-md:w-full">
        <h1 className="text-xl font-black text-white">Eduniti Top PYQs</h1>
        <p className="text-xs mt-1 text-wk-ink-400 max-md:hidden">Mock tests on Mohit Goenka sir's challenge papers.</p>
        {heading('EDUNITI CHALLENGES')}
        <div className="space-y-1 max-md:flex max-md:space-y-0 max-md:gap-2 max-md:overflow-x-auto max-md:pb-1 max-md:mt-3">
          {builtIn.map(setButton)}
          {mine.length > 0 && <div className="max-md:hidden">{heading('MY UPLOADS')}</div>}
          {mine.map(setButton)}
          <button onClick={() => setUploading(true)}
            className="w-full mt-2 px-4 py-3 rounded-xl border border-dashed text-sm font-bold text-left max-md:w-auto max-md:flex-shrink-0 max-md:mt-0 max-md:py-2"
            style={{ borderColor: uploading ? '#FF8A3D' : '#55524D', color: '#FFA94D', background: uploading ? 'rgba(255,138,61,0.1)' : 'transparent' }}>
            + Upload Eduniti PDF
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {uploading ? (
          <>
            <h2 className="text-2xl md:text-3xl font-black text-white">Upload an Eduniti PDF</h2>
            <PyqUpload onCancel={() => setUploading(false)}
              onSaved={st => { const loaded = toPyqSet(st); setUploaded(u => [loaded, ...u]); setSet(loaded); setUploading(false) }} />
          </>
        ) : (<>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <h2 className="text-2xl md:text-3xl font-black text-white">{set.title}</h2>
              <p className="text-sm text-wk-ink-400 mt-1">{set.subtitle}</p>
            </div>
            <div className="flex gap-2">
              {set.solutionUrl && <a href={set.solutionUrl} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 rounded-full text-sm font-semibold border whitespace-nowrap" style={{ borderColor: '#3A3A3A', color: '#FFA94D' }}>View Solutions ↗</a>}
              {set.uploaded && <button onClick={() => void removeUploaded(set as LoadedSet)}
                className="px-4 py-2 rounded-full text-sm font-semibold border whitespace-nowrap hover:text-red-400" style={{ borderColor: '#3A3A3A', color: '#9C968C' }}>Delete set</button>}
            </div>
          </div>

          <MockTestPanel key={set.id} set={set} candidateName={candidateName ?? null} />

          <p className="text-xs text-wk-ink-500 mt-6 leading-relaxed">
            All credit goes to Mohit Goenka sir and Eduniti for making these questions and their video solutions. No copyright infringement intended.
          </p>
        </>)}
        <div className="h-6" />
      </main>
    </div>
  )
}
