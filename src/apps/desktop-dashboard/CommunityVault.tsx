import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  classifyFile, deleteVaultItem, fetchPages, fetchVault, formatBytes, isMedia, kindLabel, mintPageUrl, signedFileUrl,
  uploadAttachment, validateAttachment, MAX_ATTACHMENTS_PER_ANNOUNCEMENT, MAX_UPLOAD_BYTES, type VaultItem, type VaultKind,
} from './lib/communityVault'
import { useLoader, useRealtimeRefresh } from './lib/communities'

/* ============================================================
   Community Vault UI
   - AttachmentPicker : attach files to a new announcement (head)
   - AttachmentChips  : files on an announcement card (head + students)
   - CommunityVaultTab: the community's library (head manages, students read)
   - MaterialViewer   : Kindle-style reader. PDFs/images are read page by
                        page with a corner page-curl, zoom/pan and jump-to-page;
                        DOCX reflows into paged text; video plays inline.
                        View-only: a deterrent layer (no save/print/right-click,
                        watermark, blank-on-blur), not DRM.
   ============================================================ */

const ACCENT = '#FF8A3D'
const CARD: React.CSSProperties = {
  background: 'linear-gradient(160deg, #161618 0%, #0B0B0D 100%)',
  borderColor: 'rgba(156,150,140,0.26)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
}
const KIND_COLOR: Record<VaultKind, string> = { pdf: '#F87171', doc: '#60A5FA', image: '#4ADE80', video: '#A78BFA', file: '#9C968C' }

/* ── icons ── */
const PATHS: Record<string, string[]> = {
  pdf: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z', 'M14 3v5h5', 'M9 13h6M9 17h4'],
  doc: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z', 'M14 3v5h5', 'M9 12h6M9 15h6M9 18h3'],
  file: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z', 'M14 3v5h5'],
  image: ['M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z', 'M3 16l5-5 4 4 3-3 6 6', 'M9 9.5h.01'],
  video: ['M4 6h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z', 'M16 10l5-3v10l-5-3'],
  clip: ['M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.9-8.9a3.3 3.3 0 014.7 4.7l-8.9 8.9a1.7 1.7 0 01-2.4-2.4l8.2-8.2'],
  vault: ['M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z', 'M3 10h18', 'M12 14v2'],
  x: ['M6 6l12 12M18 6L6 18'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12M9 7V4h6v3'],
  upload: ['M12 16V4M7 9l5-5 5 5', 'M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3'],
  download: ['M12 4v12M7 11l5 5 5-5', 'M4 20h16'],
  check: ['M5 12l5 5 9-10'],
  search: ['M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z'],
}
function I({ n, cls = 'w-4 h-4', style }: { n: keyof typeof PATHS; cls?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={cls} style={style} aria-hidden="true">
      {PATHS[n].map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}
const kindIcon = (k: VaultKind): keyof typeof PATHS => k

function KindTile({ kind, size = 40 }: { kind: VaultKind; size?: number }) {
  const c = KIND_COLOR[kind]
  return (
    <div className="rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: `${c}1A`, border: `1px solid ${c}55`, color: c }}>
      <I n={kindIcon(kind)} cls="w-[45%] h-[45%]" />
    </div>
  )
}

function itemMeta(it: VaultItem): string {
  const parts: string[] = [kindLabel(it.source_type)]
  if ((it.source_type === 'pdf') && it.page_count) parts.push(`${it.page_count} page${it.page_count === 1 ? '' : 's'}`)
  const size = formatBytes(it.original_size_bytes)
  if (size) parts.push(size)
  return parts.join(' · ')
}

/* ============================================================
   Attachment picker (new announcement form)
   ============================================================ */
export interface PendingAttachment { id: string; file: File; inVault: boolean }

export function AttachmentPicker({ files, onChange, disabled }: {
  files: PendingAttachment[]
  onChange: (next: PendingAttachment[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function add(list: FileList | null) {
    if (!list) return
    setError(null)
    const next = [...files]
    for (const f of Array.from(list)) {
      if (next.length >= MAX_ATTACHMENTS_PER_ANNOUNCEMENT) { setError(`You can attach up to ${MAX_ATTACHMENTS_PER_ANNOUNCEMENT} files per announcement.`); break }
      const bad = validateAttachment(f)
      if (bad) { setError(bad); continue }
      next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, inVault: true })
    }
    onChange(next)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors text-wk-ink-400 hover:text-wk-ink-200 disabled:opacity-40"
          style={{ borderColor: '#26262A' }}>
          <I n="clip" cls="w-3.5 h-3.5" /> Attach files
        </button>
        <span className="text-[11px] text-wk-ink-600">PDF, DOCX, images, video · up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB each</span>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => add(e.target.files)} />
      </div>
      {error && <div className="text-[12px] text-amber-300 mt-2">{error}</div>}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map(a => {
            const kind = classifyFile(a.file)
            return (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border" style={{ background: 'rgba(22,22,24,0.55)', borderColor: 'rgba(38,38,42,0.6)' }}>
                <KindTile kind={kind} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-wk-ink-200 truncate">{a.file.name}</div>
                  <div className="text-[11px] text-wk-ink-500">{kindLabel(kind)} · {formatBytes(a.file.size)}</div>
                </div>
                <div className="flex rounded-full border overflow-hidden text-[11px] font-semibold flex-shrink-0" style={{ borderColor: '#26262A' }} role="group" aria-label="What to do with this file">
                  {([[true, 'Save to Vault'], [false, 'Just send']] as const).map(([v, label]) => (
                    <button key={label} type="button" disabled={disabled} aria-pressed={a.inVault === v}
                      onClick={() => onChange(files.map(f => f.id === a.id ? { ...f, inVault: v } : f))}
                      className="px-3 py-1.5 transition-colors"
                      style={{ background: a.inVault === v ? `${ACCENT}26` : 'transparent', color: a.inVault === v ? ACCENT : '#7A756D' }}>
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={disabled} aria-label={`Remove ${a.file.name}`} onClick={() => onChange(files.filter(f => f.id !== a.id))}
                  className="text-wk-ink-600 hover:text-red-400 transition-colors"><I n="x" /></button>
              </div>
            )
          })}
          <div className="text-[11px] text-wk-ink-600 leading-relaxed">
            “Save to Vault” keeps the file in your community’s library for everyone to open anytime. “Just send” attaches it to this announcement only.
          </div>
        </div>
      )}
    </div>
  )
}

/** Upload every pending attachment against a freshly posted announcement.
 *  Returns the names that failed (the announcement itself is already live). */
export async function uploadPending(groupId: string, announcementId: string, files: PendingAttachment[], onStatus: (s: string) => void): Promise<string[]> {
  const failed: string[] = []
  for (let i = 0; i < files.length; i++) {
    const a = files[i]
    const prefix = files.length > 1 ? `(${i + 1}/${files.length}) ` : ''
    try {
      await uploadAttachment(groupId, a.file, { inVault: a.inVault, announcementId, onStatus: s => onStatus(prefix + s) })
    } catch (e) {
      failed.push(`${a.file.name}: ${(e as Error).message}`)
    }
  }
  return failed
}

/* ============================================================
   Chips on an announcement card
   ============================================================ */
export function AttachmentChips({ items, viewerName }: { items: VaultItem[]; viewerName: string }) {
  const [open, setOpen] = useState<VaultItem | null>(null)
  if (items.length === 0) return null
  return (
    <>
      <div className="flex flex-wrap gap-2 mt-3">
        {items.map(it => (
          <button key={it.id} type="button" onClick={() => setOpen(it)}
            className="flex items-center gap-2.5 pl-2 pr-3.5 py-2 rounded-xl border text-left max-w-[280px] transition-colors hover:border-[rgba(255,138,61,0.45)]"
            style={{ background: 'rgba(22,22,24,0.55)', borderColor: 'rgba(38,38,42,0.8)' }}>
            <KindTile kind={it.source_type} size={32} />
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-wk-ink-200 truncate">{it.title}</div>
              <div className="text-[10.5px] text-wk-ink-500 flex items-center gap-1.5">
                {itemMeta(it)}
                {it.in_vault && <span className="inline-flex items-center gap-0.5" style={{ color: ACCENT }}><I n="vault" cls="w-2.5 h-2.5" /> Vault</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
      {open && <MaterialViewer item={open} viewerName={viewerName} onClose={() => setOpen(null)} />}
    </>
  )
}

/* ============================================================
   Vault tab
   ============================================================ */
type VaultFilter = 'all' | 'docs' | 'media'

export function CommunityVaultTab({ groupId, isAdmin, viewerName, communityName }: {
  groupId: string
  isAdmin: boolean
  viewerName: string
  communityName: string
}) {
  const q = useLoader(() => fetchVault(groupId), [] as VaultItem[], [groupId], 0)
  useRealtimeRefresh('group_materials', `group_id=eq.${groupId}`, () => { void q.refresh() })
  const [filter, setFilter] = useState<VaultFilter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<VaultItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => q.data
    .filter(i => filter === 'all' ? true : filter === 'media' ? isMedia(i.source_type) : !isMedia(i.source_type))
    .filter(i => i.title.toLowerCase().includes(query.trim().toLowerCase())), [q.data, filter, query])

  const counts = useMemo(() => ({
    all: q.data.length,
    docs: q.data.filter(i => !isMedia(i.source_type)).length,
    media: q.data.filter(i => isMedia(i.source_type)).length,
  }), [q.data])

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return
    const files = Array.from(list)
    setErrors([])
    const failed: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const prefix = files.length > 1 ? `(${i + 1}/${files.length}) ` : ''
      try {
        await uploadAttachment(groupId, f, { inVault: true, onStatus: s => setBusy(prefix + s) })
      } catch (e) {
        failed.push(`${f.name}: ${(e as Error).message}`)
      }
    }
    setBusy(null)
    setErrors(failed)
    if (inputRef.current) inputRef.current.value = ''
    await q.refresh()
  }

  async function remove(it: VaultItem) {
    setConfirmDelete(null)
    try { await deleteVaultItem(it); await q.refresh() } catch (e) { setErrors([(e as Error).message]) }
  }

  const FILTERS: { id: VaultFilter; label: string }[] = [
    { id: 'all', label: `All · ${counts.all}` }, { id: 'docs', label: `Documents · ${counts.docs}` }, { id: 'media', label: `Media · ${counts.media}` },
  ]

  return (
    <div className="space-y-3.5">
      <div className="p-5 rounded-2xl border" style={CARD}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${ACCENT}1F`, border: `1px solid ${ACCENT}55`, color: ACCENT }}>
              <I n="vault" cls="w-[18px] h-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-wk-ink-100 leading-tight" style={{ fontFamily: 'Sora, sans-serif' }}>{communityName} Vault</div>
              <div className="text-[11px] text-wk-ink-500 leading-tight mt-0.5">
                {isAdmin ? 'Everything you save here is open to every student, anytime.' : 'Notes, papers and media shared by your WynkoHead.'}
              </div>
            </div>
          </div>
          {isAdmin && (
            <>
              <button type="button" disabled={!!busy} onClick={() => inputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-wk-black-950 flex items-center gap-2 transition-all enabled:hover:opacity-90 disabled:opacity-50"
                style={{ background: ACCENT }}>
                <I n="upload" /> {busy ? 'Uploading…' : 'Add to Vault'}
              </button>
              <input ref={inputRef} type="file" multiple className="hidden" onChange={e => void upload(e.target.files)} />
            </>
          )}
        </div>
        {busy && <div className="text-[12px] text-wk-ink-400 mt-3">{busy}</div>}
        {errors.length > 0 && (
          <div className="mt-3 space-y-1">{errors.map((e, i) => <div key={i} className="text-[12px] text-amber-300">{e}</div>)}</div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {FILTERS.map(f => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition-colors"
              style={{ background: filter === f.id ? `${ACCENT}1F` : 'transparent', color: filter === f.id ? ACCENT : '#7A756D', borderColor: filter === f.id ? `${ACCENT}66` : '#26262A' }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <I n="search" cls="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-wk-ink-600" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the Vault"
            className="pl-8 pr-3 py-2 w-56 rounded-xl border bg-transparent text-[13px] text-wk-ink-200 outline-none placeholder-wk-ink-600 focus:border-wk-orange-500/50 border-[#26262A]" />
        </div>
      </div>

      {q.status === 'loading' && q.data.length === 0 ? (
        <div className="p-10 rounded-2xl border text-center text-sm text-wk-ink-500" style={CARD}>Loading the Vault…</div>
      ) : q.status === 'error' && q.data.length === 0 ? (
        <div className="p-10 rounded-2xl border text-center" style={CARD}>
          <div className="text-sm font-semibold text-wk-ink-300 mb-1">Couldn’t load the Vault</div>
          <div className="text-[12px] text-wk-ink-500 mb-4">{q.error}</div>
          <button onClick={() => void q.refresh()} className="px-5 py-2 rounded-xl text-[13px] font-semibold text-wk-black-950" style={{ background: ACCENT }}>Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 rounded-2xl border text-center" style={CARD}>
          <div className="text-sm font-semibold text-wk-ink-300 mb-1">{q.data.length === 0 ? 'The Vault is empty' : 'Nothing matches'}</div>
          <div className="text-[12px] text-wk-ink-500">
            {q.data.length === 0
              ? (isAdmin ? 'Add files here, or choose “Save to Vault” when you attach files to an announcement.' : 'Files your WynkoHead saves will show up here.')
              : 'Try a different search or filter.'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map(it => (
            <div key={it.id} className="group relative rounded-2xl border p-4 flex items-center gap-3.5 transition-colors hover:border-[rgba(255,138,61,0.4)]" style={CARD}>
              <button type="button" onClick={() => setOpen(it)} className="flex items-center gap-3.5 min-w-0 flex-1 text-left">
                <KindTile kind={it.source_type} size={44} />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-wk-ink-100 truncate">{it.title}</div>
                  <div className="text-[11px] text-wk-ink-500 mt-0.5">{itemMeta(it)}</div>
                  <div className="text-[10.5px] text-wk-ink-600 mt-0.5">{new Date(it.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
              </button>
              {isAdmin && (confirmDelete === it.id ? (
                <span className="flex items-center gap-1.5 text-[11px] flex-shrink-0">
                  <button onClick={() => void remove(it)} className="font-semibold text-red-400 hover:text-red-300">Delete</button>
                  <span className="text-wk-ink-700">·</span>
                  <button onClick={() => setConfirmDelete(null)} className="text-wk-ink-500 hover:text-wk-ink-300">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(it.id)} aria-label={`Delete ${it.title}`} className="text-wk-ink-600 hover:text-red-400 transition-colors flex-shrink-0"><I n="trash" /></button>
              ))}
            </div>
          ))}
        </div>
      )}
      {open && <MaterialViewer item={open} viewerName={viewerName} onClose={() => setOpen(null)} />}
    </div>
  )
}

/* ============================================================
   Viewer
   ============================================================ */
const MIN_SCALE = 1
const MAX_SCALE = 4
const CACHE_TTL_MS = 45_000 // minted page URLs are short-lived
const PREFETCH_RADIUS = 1

const VIEWER_CSS = `
.mv-root { position:fixed; inset:0; z-index:9999; background:#000; display:flex; flex-direction:column; color:#eee; font:14px system-ui,sans-serif; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
.mv-root img, .mv-root video { -webkit-user-drag:none; }
.mv-bar { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; padding:10px 16px; box-sizing:border-box; background:#111; flex-wrap:wrap; }
.mv-bar button { background:#222; color:#eee; border:1px solid #444; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px; }
.mv-bar button:disabled { opacity:.35; cursor:default; }
.mv-grp { display:flex; align-items:center; gap:8px; }
.mv-title { max-width:34vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.mv-jump { width:44px; background:#181818; border:1px solid #444; border-radius:6px; color:#eee; padding:5px 6px; font-size:13px; text-align:center; }
.mv-stage { flex:1; width:100%; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; touch-action:none; min-height:0; }
.mv-img { max-width:100%; max-height:100%; will-change:transform; transition:transform .08s ease-out; }
.mv-img.pan { transition:none; cursor:grabbing; } .mv-img.zoomed { cursor:grab; }
.mv-tap { position:absolute; top:0; bottom:0; width:35%; cursor:pointer; z-index:4; } .mv-tap.l { left:0; } .mv-tap.r { right:0; }
.mv-note { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#eee; font-size:13px; z-index:3; pointer-events:none; text-align:center; padding:24px; }
.mv-cover { position:absolute; inset:0; background:#000; z-index:8; display:flex; align-items:center; justify-content:center; color:#777; font-size:13px; }
.mv-mark { position:absolute; inset:0; z-index:6; pointer-events:none; }
.mv-doc { max-width:760px; width:100%; height:100%; margin:0 auto; padding:28px 36px; box-sizing:border-box; position:relative; }
.mv-doc-view { width:100%; height:100%; overflow:hidden; }
.mv-doc-cols { height:100%; column-fill:auto; will-change:transform; transition:transform .25s ease; font-family:Georgia,'Times New Roman',serif; line-height:1.7; }
.mv-doc-cols h1,.mv-doc-cols h2,.mv-doc-cols h3 { font-family:system-ui,sans-serif; line-height:1.25; margin:1.1em 0 .5em; break-after:avoid; }
.mv-doc-cols p { margin:0 0 .9em; } .mv-doc-cols img { max-width:100%; max-height:70vh; break-inside:avoid; }
.mv-doc-cols table { border-collapse:collapse; max-width:100%; } .mv-doc-cols td,.mv-doc-cols th { border:1px solid currentColor; padding:4px 8px; opacity:.9; }
.mv-doc-cols a { color:inherit; text-decoration:underline; } .mv-doc-cols ul,.mv-doc-cols ol { padding-left:1.4em; margin:0 0 .9em; }
@media (max-width:640px){ .mv-bar{justify-content:center;padding:8px 10px;} .mv-title{max-width:60vw;} .mv-doc{padding:18px 20px;} }
@media print { .mv-root { display:none !important; } }
`

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string))

/** Faint tiled "viewer name · timestamp" overlay - discourages leaked screenshots. */
function Watermark({ text, tone = 'light' }: { text: string; tone?: 'light' | 'dark' }) {
  const fill = tone === 'light' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200"><text x="170" y="100" text-anchor="middle" transform="rotate(-24 170 100)" font-family="system-ui,sans-serif" font-size="14" fill="${fill}">${xmlEscape(text)}</text></svg>`
  return <div className="mv-mark" style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")` }} />
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise(resolve => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(im); im.src = src })
}

/** Diagonal corner page-curl, drawn per frame on a canvas over the stage: most
 *  of the page stays flat while a fold sweeps corner to corner and the rolling
 *  strip shows a mirrored, shaded underside. Whatever the fold has passed shows
 *  the incoming page already sitting underneath. */
function playPageCurl(stage: HTMLElement, oldImg: HTMLImageElement, direction: 'next' | 'prev'): Promise<void> {
  return new Promise(resolve => {
    const rect = stage.getBoundingClientRect()
    const W = rect.width, H = rect.height
    if (!W || !H || !oldImg.naturalWidth) { resolve(); return }
    const dpr = window.devicePixelRatio || 1
    const canvas = document.createElement('canvas')
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;z-index:5;pointer-events:none`
    stage.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) { canvas.remove(); resolve(); return }
    ctx.scale(dpr, dpr)

    const nw = oldImg.naturalWidth, nh = oldImg.naturalHeight
    const fit = Math.min(W / nw, H / nh)
    const dw = nw * fit, dh = nh * fit, ox = (W - dw) / 2, oy = (H - dh) / 2
    const A = direction === 'next' ? { x: ox + dw, y: oy + dh } : { x: ox, y: oy + dh }
    const B = direction === 'next' ? { x: ox, y: oy } : { x: ox + dw, y: oy }
    const L = Math.hypot(B.x - A.x, B.y - A.y) || 1
    const d = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }
    const n = { x: -d.y, y: d.x }
    const angle = Math.atan2(d.y, d.x)
    const roll = L * 0.22
    const BIG = Math.max(W, H) * 3
    const band = (p0: number, p1: number) => ([[p0, -BIG], [p0, BIG], [p1, BIG], [p1, -BIG]] as const)
      .map(([p, off]) => ({ x: A.x + d.x * p + n.x * off, y: A.y + d.y * p + n.y * off }))
    const clip = (pts: { x: number; y: number }[]) => {
      ctx.beginPath(); pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.closePath(); ctx.clip()
    }
    const gradient = (p0: number, p1: number, stops: [number, string][]) => {
      const g = ctx.createLinearGradient(A.x + d.x * p0, A.y + d.y * p0, A.x + d.x * p1, A.y + d.y * p1)
      stops.forEach(([s, c]) => g.addColorStop(s, c))
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    }

    const DURATION = 560
    const start = performance.now()
    let done = false
    const finish = () => { if (done) return; done = true; canvas.remove(); resolve() }
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const fold = (1 - Math.pow(1 - t, 2.2)) * (L + roll)
      const low = fold - roll
      ctx.clearRect(0, 0, W, H)
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
      ctx.save(); clip(band(fold, BIG)); ctx.drawImage(oldImg, ox, oy, dw, dh); ctx.restore()
      ctx.save(); clip(band(low, fold))
      const fp = { x: A.x + d.x * fold, y: A.y + d.y * fold }
      ctx.translate(fp.x, fp.y); ctx.rotate(angle); ctx.scale(-1, 1); ctx.rotate(-angle); ctx.translate(-fp.x, -fp.y)
      ctx.globalAlpha = 0.94; ctx.drawImage(oldImg, ox, oy, dw, dh); ctx.globalAlpha = 1
      gradient(low, fold, [[0, 'rgba(0,0,0,0)'], [0.65, 'rgba(0,0,0,0.26)'], [1, 'rgba(0,0,0,0.5)']])
      ctx.restore()
      ctx.save(); const span = roll * 0.6; clip(band(low - span, low)); gradient(low - span, low, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']]); ctx.restore()
      ctx.restore()
      if (t < 1) requestAnimationFrame(frame); else finish()
    }
    requestAnimationFrame(frame)
    setTimeout(finish, DURATION + 250) // never leave the canvas stuck on screen
  })
}

export function MaterialViewer({ item, viewerName, onClose }: { item: VaultItem; viewerName: string; onClose: () => void }) {
  const stamp = useMemo(() => `${viewerName || 'Wynko student'} · ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, [viewerName])
  const [covered, setCovered] = useState(false)
  const kind = item.source_type

  // Deterrents: no save/print shortcuts, no context menu, blank when the tab/window loses focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(e.key.toLowerCase())) e.preventDefault()
      if (e.key === 'Escape') onClose()
    }
    const sync = () => setCovered(document.hidden || !document.hasFocus())
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('blur', sync)
    window.addEventListener('focus', sync)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('blur', sync)
      window.removeEventListener('focus', sync)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const blockMenu = (e: React.SyntheticEvent) => e.preventDefault()
  const shield = kind !== 'video' && kind !== 'file' // blank-on-blur would just be annoying while a video plays

  return createPortal(
    <div className="mv-root" role="dialog" aria-modal="true" aria-label={item.title}
      onContextMenu={blockMenu} onDragStart={blockMenu} onSelect={blockMenu}>
      <style>{VIEWER_CSS}</style>
      {kind === 'pdf' || kind === 'image' ? <PageReader item={item} stamp={stamp} onClose={onClose} />
        : kind === 'doc' ? <DocReader item={item} stamp={stamp} onClose={onClose} />
        : kind === 'video' ? <VideoPlayer item={item} stamp={stamp} onClose={onClose} />
        : <FileDownload item={item} onClose={onClose} />}
      {shield && covered && <div className="mv-cover">Paused — return to this window to keep reading</div>}
    </div>,
    document.body,
  )
}

/* ── PDF / image: page-by-page reader ── */
function PageReader({ item, stamp, onClose }: { item: VaultItem; stamp: string; onClose: () => void }) {
  const [pages, setPages] = useState<number[] | null>(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState({ scale: MIN_SCALE, tx: 0, ty: 0 })
  const [jump, setJump] = useState('1')

  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const viewRef = useRef(view); viewRef.current = view
  const cache = useRef<Record<number, { status: 'loading' | 'ready'; url?: string; time?: number }>>({})
  const req = useRef(0)
  const busy = useRef(false)
  const pending = useRef<number | null>(null)
  const indexRef = useRef(0)
  const pagesRef = useRef<number[] | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const setZoom = useCallback((next: { scale: number; tx: number; ty: number }) => { viewRef.current = next; setView(next) }, [])
  const resetZoom = useCallback(() => setZoom({ scale: MIN_SCALE, tx: 0, ty: 0 }), [setZoom])

  const prefetch = useCallback(async (i: number) => {
    const pgs = pagesRef.current
    if (!pgs || i < 0 || i >= pgs.length) return
    const ex = cache.current[i]
    if (ex && (ex.status === 'loading' || (ex.status === 'ready' && Date.now() - (ex.time ?? 0) < CACHE_TTL_MS))) return
    cache.current[i] = { status: 'loading' }
    try {
      const url = await mintPageUrl(item.id, pgs[i])
      await loadImage(url)
      if (cache.current[i]?.status === 'loading') cache.current[i] = { status: 'ready', url, time: Date.now() }
    } catch { delete cache.current[i] }
  }, [item.id])

  const schedulePrefetch = useCallback((i: number) => {
    for (let k = i - PREFETCH_RADIUS; k <= i + PREFETCH_RADIUS; k++) void prefetch(k)
    Object.keys(cache.current).forEach(key => { if (Math.abs(Number(key) - i) > PREFETCH_RADIUS) delete cache.current[Number(key)] })
  }, [prefetch])

  // Guarded against out-of-order responses: each render stamps a request id and
  // sets `busy`; taps that land mid-turn are queued in `pending` and replayed.
  const renderPage = useCallback(async (i: number) => {
    const pgs = pagesRef.current
    if (!pgs) return
    const my = ++req.current
    busy.current = true
    pending.current = null
    setLoading(true)
    let url: string
    const hit = cache.current[i]
    if (hit && hit.status === 'ready' && Date.now() - (hit.time ?? 0) < CACHE_TTL_MS && hit.url) {
      url = hit.url
    } else {
      try {
        url = await mintPageUrl(item.id, pgs[i])
        await loadImage(url)
      } catch (e) {
        if (alive.current && req.current === my) { busy.current = false; setLoading(false); setError((e as Error).message) }
        return
      }
      if (!alive.current || req.current !== my) return
    }
    const img = imgRef.current, stage = stageRef.current
    if (!img || !stage) return
    const direction: 'next' | 'prev' = i > indexRef.current ? 'next' : 'prev'
    const oldSrc = img.getAttribute('src')
    img.src = url
    if (oldSrc) { const old = await loadImage(oldSrc); if (!alive.current) return; await playPageCurl(stage, old, direction) }
    if (!alive.current || req.current !== my) return
    indexRef.current = i
    setIndex(i); setJump(String(i + 1)); resetZoom()
    busy.current = false
    setLoading(false)
    schedulePrefetch(i)
    if (pending.current !== null && pending.current !== i) { const nx = pending.current; pending.current = null; void renderPage(nx) }
  }, [item.id, resetZoom, schedulePrefetch])

  const goTo = useCallback((i: number) => {
    const pgs = pagesRef.current
    if (!pgs || i < 0 || i > pgs.length - 1 || i === indexRef.current) return
    if (busy.current) { pending.current = i; return }
    void renderPage(i)
  }, [renderPage])
  const target = () => (busy.current && pending.current !== null ? pending.current : indexRef.current)
  const next = useCallback(() => goTo(target() + 1), [goTo])
  const prev = useCallback(() => goTo(target() - 1), [goTo])
  const zoomBy = useCallback((delta: number) => {
    const v = viewRef.current
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale + delta))
    if (s === v.scale) return
    setZoom(s === MIN_SCALE ? { scale: s, tx: 0, ty: 0 } : { ...v, scale: s })
  }, [setZoom])

  // Load the page list, then show page 1.
  useEffect(() => {
    let cancelled = false
    fetchPages(item.id).then(pgs => {
      if (cancelled) return
      if (!pgs.length) { setError('This file has no pages.'); setLoading(false); return }
      pagesRef.current = pgs
      setPages(pgs)
      void renderPage(0)
    }).catch(e => { if (!cancelled) { setError((e as Error).message); setLoading(false) } })
    return () => { cancelled = true }
  }, [item.id, renderPage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === '+' || e.key === '=') zoomBy(0.5)
      else if (e.key === '-') zoomBy(-0.5)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, prev, zoomBy])

  // Zoom & pan: wheel, double-click/tap, drag when zoomed, two-finger pinch.
  useEffect(() => {
    const stage = stageRef.current, img = imgRef.current
    if (!stage || !img) return
    const clamp = (v: { scale: number; tx: number; ty: number }) => {
      const mx = (stage.clientWidth / 2) * (v.scale - 1) / v.scale + 40
      const my = (stage.clientHeight / 2) * (v.scale - 1) / v.scale + 40
      return { ...v, tx: Math.min(mx, Math.max(-mx, v.tx)), ty: Math.min(my, Math.max(-my, v.ty)) }
    }
    let dragging = false, lx = 0, ly = 0
    const down = (e: MouseEvent) => { if (viewRef.current.scale <= MIN_SCALE) return; dragging = true; lx = e.clientX; ly = e.clientY; img.classList.add('pan'); e.preventDefault() }
    const move = (e: MouseEvent) => {
      if (!dragging) return
      const v = viewRef.current
      setZoom(clamp({ scale: v.scale, tx: v.tx + (e.clientX - lx) / v.scale, ty: v.ty + (e.clientY - ly) / v.scale }))
      lx = e.clientX; ly = e.clientY
    }
    const up = () => { dragging = false; img.classList.remove('pan') }
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.35 : -0.35) }
    const dbl = () => (viewRef.current.scale > MIN_SCALE ? resetZoom() : zoomBy(1.5))

    let pinchDist = 0, pinchScale = 1, tx0 = 0, ty0 = 0, panning = false, lastTap = 0
    const dist = (a: Touch, b: Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    const ts = (e: TouchEvent) => {
      if (e.touches.length === 2) { pinchDist = dist(e.touches[0], e.touches[1]); pinchScale = viewRef.current.scale; panning = false }
      else if (e.touches.length === 1) {
        const now = Date.now()
        if (now - lastTap < 300) dbl()
        lastTap = now
        if (viewRef.current.scale > MIN_SCALE) { panning = true; tx0 = e.touches[0].clientX; ty0 = e.touches[0].clientY }
      }
    }
    const tm = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchDist > 0) {
        e.preventDefault()
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchScale * (dist(e.touches[0], e.touches[1]) / pinchDist)))
        setZoom(s === MIN_SCALE ? { scale: s, tx: 0, ty: 0 } : { ...viewRef.current, scale: s })
      } else if (panning && e.touches.length === 1) {
        e.preventDefault()
        const t = e.touches[0], v = viewRef.current
        setZoom(clamp({ scale: v.scale, tx: v.tx + (t.clientX - tx0) / v.scale, ty: v.ty + (t.clientY - ty0) / v.scale }))
        tx0 = t.clientX; ty0 = t.clientY
      }
    }
    const te = (e: TouchEvent) => { if (e.touches.length < 2) pinchDist = 0; if (e.touches.length === 0) panning = false }

    img.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    stage.addEventListener('wheel', wheel, { passive: false })
    img.addEventListener('dblclick', dbl)
    stage.addEventListener('touchstart', ts, { passive: true })
    stage.addEventListener('touchmove', tm, { passive: false })
    stage.addEventListener('touchend', te)
    return () => {
      img.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      stage.removeEventListener('wheel', wheel)
      img.removeEventListener('dblclick', dbl)
      stage.removeEventListener('touchstart', ts)
      stage.removeEventListener('touchmove', tm)
      stage.removeEventListener('touchend', te)
    }
  }, [setZoom, zoomBy, resetZoom])

  const total = pages?.length ?? 0
  const eff = busy.current && pending.current !== null ? pending.current : index
  const zoomed = view.scale > MIN_SCALE

  return (
    <>
      <div className="mv-stage" ref={stageRef}>
        <img ref={imgRef} className={`mv-img${zoomed ? ' zoomed' : ''}`} draggable={false} alt={item.title}
          style={{ transform: `scale(${view.scale}) translate(${view.tx}px, ${view.ty}px)` }} />
        <div className="mv-tap l" style={{ pointerEvents: zoomed ? 'none' : undefined }} onClick={prev} />
        <div className="mv-tap r" style={{ pointerEvents: zoomed ? 'none' : undefined }} onClick={next} />
        {loading && !error && <div className="mv-note">Loading…</div>}
        {error && <div className="mv-note" style={{ color: '#fbbf24' }}>{error}</div>}
        <Watermark text={stamp} />
      </div>
      <div className="mv-bar">
        <div className="mv-grp">
          <button onClick={prev} disabled={eff <= 0}>‹ Prev</button>
          <span>{total ? `${index + 1} / ${total}` : ''}</span>
          <button onClick={next} disabled={!total || eff >= total - 1}>Next ›</button>
        </div>
        <span className="mv-title" title={item.title}>{item.title}</span>
        <div className="mv-grp">
          <button onClick={() => zoomBy(-0.5)} disabled={view.scale <= MIN_SCALE} title="Zoom out">−</button>
          <span style={{ minWidth: 38, textAlign: 'center', fontSize: 12, color: '#aaa' }}>{Math.round(view.scale * 100)}%</span>
          <button onClick={() => zoomBy(0.5)} disabled={view.scale >= MAX_SCALE} title="Zoom in">+</button>
        </div>
        {total > 1 && (
          <div className="mv-grp">
            <input className="mv-jump" type="number" min={1} max={total} value={jump} title="Jump to page"
              onChange={e => setJump(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') goTo(Math.min(Math.max(1, parseInt(jump, 10) || 1), total) - 1) }} />
            <button onClick={() => goTo(Math.min(Math.max(1, parseInt(jump, 10) || 1), total) - 1)}>Go</button>
          </div>
        )}
        <button onClick={onClose}>Close</button>
      </div>
    </>
  )
}

/* ── DOCX: reflowed, paged reader (CSS columns) ── */
type DocTheme = 'dark' | 'sepia' | 'light'
const DOC_THEMES: Record<DocTheme, { bg: string; fg: string; mark: 'light' | 'dark' }> = {
  dark: { bg: '#121214', fg: '#d8d4cc', mark: 'light' },
  sepia: { bg: '#f4ecd8', fg: '#433422', mark: 'dark' },
  light: { bg: '#ffffff', fg: '#1a1a1a', mark: 'dark' },
}

/** mammoth's output is a small tag set, but strip anything active regardless. */
export function sanitizeDocHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base').forEach(el => el.remove())
  doc.body.querySelectorAll('*').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name)
    }
    if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer') }
  })
  return doc.body.innerHTML
}

function DocReader({ item, stamp, onClose }: { item: VaultItem; stamp: string; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<DocTheme>('dark')
  const [fontPx, setFontPx] = useState(18)
  const [page, setPage] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [width, setWidth] = useState(0)
  const viewRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const GAP = 48

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!item.storage_path) throw new Error('This document has no file attached.')
        const url = await signedFileUrl(item.storage_path)
        const res = await fetch(url)
        if (!res.ok) throw new Error('Could not download this document.')
        const buf = await res.arrayBuffer()
        const mammoth = await import('mammoth/mammoth.browser')
        const out = await mammoth.convertToHtml({ arrayBuffer: buf })
        if (!cancelled) setHtml(sanitizeDocHtml(out.value) || '<p>This document is empty.</p>')
      } catch (e) { if (!cancelled) setError((e as Error).message) }
    })()
    return () => { cancelled = true }
  }, [item.storage_path])

  useLayoutEffect(() => {
    const el = viewRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el); setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [html])

  useLayoutEffect(() => {
    const cols = colsRef.current
    if (!cols || !width) return
    const count = Math.max(1, Math.ceil((cols.scrollWidth + GAP) / (width + GAP)))
    setPageCount(count)
    setPage(p => Math.min(p, count - 1))
  }, [html, width, fontPx])

  const go = useCallback((p: number) => setPage(Math.min(Math.max(0, p), pageCount - 1)), [pageCount])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(page + 1) }
      else if (e.key === 'ArrowLeft') go(page - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, page])

  const t = DOC_THEMES[theme]
  return (
    <>
      <div className="mv-stage" style={{ background: t.bg, color: t.fg, touchAction: 'pan-y' }}>
        {error ? <div className="mv-note" style={{ color: '#b45309' }}>{error}</div>
          : html === null ? <div className="mv-note" style={{ color: t.fg }}>Opening document…</div>
          : (
            <div className="mv-doc">
              <div className="mv-doc-view" ref={viewRef}>
                <div ref={colsRef} className="mv-doc-cols"
                  style={{ fontSize: fontPx, columnWidth: width || undefined, columnGap: GAP, transform: `translateX(-${page * (width + GAP)}px)` }}
                  dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          )}
        <div className="mv-tap l" onClick={() => go(page - 1)} />
        <div className="mv-tap r" onClick={() => go(page + 1)} />
        <Watermark text={stamp} tone={t.mark} />
      </div>
      <div className="mv-bar">
        <div className="mv-grp">
          <button onClick={() => go(page - 1)} disabled={page <= 0}>‹ Prev</button>
          <span>{html ? `${page + 1} / ${pageCount}` : ''}</span>
          <button onClick={() => go(page + 1)} disabled={page >= pageCount - 1}>Next ›</button>
        </div>
        <span className="mv-title" title={item.title}>{item.title}</span>
        <div className="mv-grp">
          <button onClick={() => setFontPx(f => Math.max(13, f - 2))} title="Smaller text">A−</button>
          <button onClick={() => setFontPx(f => Math.min(30, f + 2))} title="Larger text">A+</button>
          <button onClick={() => setTheme(th => (th === 'dark' ? 'sepia' : th === 'sepia' ? 'light' : 'dark'))} title="Change theme">{theme === 'dark' ? 'Night' : theme === 'sepia' ? 'Sepia' : 'Day'}</button>
        </div>
        <button onClick={onClose}>Close</button>
      </div>
    </>
  )
}

/* ── Video ── */
function VideoPlayer({ item, stamp, onClose }: { item: VaultItem; stamp: string; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!item.storage_path) { setError('This video has no file attached.'); return }
    signedFileUrl(item.storage_path, { seconds: 3600 }).then(u => { if (!cancelled) setSrc(u) }).catch(e => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [item.storage_path])
  return (
    <>
      <div className="mv-stage" style={{ touchAction: 'auto' }}>
        {src && <video src={src} controls autoPlay playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture
          style={{ maxWidth: '100%', maxHeight: '100%' }} />}
        {!src && !error && <div className="mv-note">Loading video…</div>}
        {error && <div className="mv-note" style={{ color: '#fbbf24' }}>{error}</div>}
        <Watermark text={stamp} />
      </div>
      <div className="mv-bar">
        <span className="mv-title" style={{ maxWidth: '70vw' }} title={item.title}>{item.title}</span>
        <button onClick={onClose}>Close</button>
      </div>
    </>
  )
}

/* ── Anything else: a plain download ── */
function FileDownload({ item, onClose }: { item: VaultItem; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function download() {
    if (!item.storage_path) { setError('This file has no data attached.'); return }
    setBusy(true); setError(null)
    try {
      const url = await signedFileUrl(item.storage_path, { download: item.file_name || item.title, seconds: 60 })
      const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <>
      <div className="mv-stage" style={{ touchAction: 'auto' }}>
        <div className="text-center px-6" style={{ maxWidth: 420 }}>
          <div className="mx-auto mb-4 flex justify-center"><KindTile kind="file" size={64} /></div>
          <div className="text-lg font-semibold text-white mb-1 break-words">{item.title}</div>
          <div className="text-[12px] text-wk-ink-500 mb-5">{itemMeta(item)} — this file type can’t be previewed in Wynko.</div>
          <button onClick={() => void download()} disabled={busy}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-wk-black-950 inline-flex items-center gap-2 disabled:opacity-50" style={{ background: ACCENT }}>
            <I n="download" /> {busy ? 'Preparing…' : 'Download'}
          </button>
          {error && <div className="text-[12px] text-amber-300 mt-3">{error}</div>}
        </div>
      </div>
      <div className="mv-bar" style={{ justifyContent: 'flex-end' }}><button onClick={onClose}>Close</button></div>
    </>
  )
}
