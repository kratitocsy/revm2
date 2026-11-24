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

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="text-[11px] font-mono tracking-[0.3em] text-wk-orange-300 mb-2">ELITE PRACTICE</div>
      <h1 className="text-2xl md:text-3xl font-black text-white">Eduniti Top PYQs</h1>
      <p className="text-sm text-wk-ink-400 mt-1">Full mock tests on the best previous-year questions, with a full analysis after.</p>

      <div className="flex gap-2 mt-4 flex-wrap">
        {allSets.map(s => (
          <button key={s.id} onClick={() => { setSet(s); setUploading(false) }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border max-w-[260px] truncate"
            style={{ background: s.id === set.id && !uploading ? 'rgba(255,138,61,0.15)' : 'transparent', borderColor: s.id === set.id && !uploading ? '#FF8A3D' : '#3A3A3A', color: s.id === set.id && !uploading ? '#FFA94D' : '#9C968C' }}>
            {s.uploaded ? '📄 ' : ''}{s.title}
          </button>
        ))}
        <button onClick={() => setUploading(true)}
          className="px-3 py-1.5 rounded-full text-xs font-bold border border-dashed"
          style={{ borderColor: uploading ? '#FF8A3D' : '#55524D', color: '#FFA94D' }}>
          + Upload Eduniti PDF
        </button>
      </div>

      {uploading ? (
        <PyqUpload onCancel={() => setUploading(false)}
          onSaved={st => { const loaded = toPyqSet(st); setUploaded(u => [loaded, ...u]); setSet(loaded); setUploading(false) }} />
      ) : (<>
        <div className="mt-4 rounded-2xl border p-4" style={{ background: '#161618', borderColor: '#26262A' }}>
          <div className="text-base font-bold text-white">{set.title}</div>
          <p className="text-sm text-wk-ink-300 mt-1">{set.subtitle}</p>
          <p className="text-xs text-wk-ink-400 mt-3 leading-relaxed">
            All credit goes to Mohit Goenka sir and Eduniti for making these questions and their video solutions. No copyright infringement intended.
          </p>
          <p className="text-xs mt-2">
            {set.solutionUrl && <a href={set.solutionUrl} target="_blank" rel="noopener noreferrer" className="text-wk-orange-300 underline">Watch the video solutions</a>}
            {set.uploaded && <button onClick={() => void removeUploaded(set as LoadedSet)} className="ml-3 underline text-wk-ink-500 hover:text-red-400">Delete this set</button>}
          </p>
        </div>

        <MockTestPanel key={set.id} set={set} candidateName={candidateName ?? null} />
      </>)}
      <div className="h-6" />
    </div>
  )
}
