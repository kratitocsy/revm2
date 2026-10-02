import { describe, expect, it, beforeEach, vi } from 'vitest'
import worker, { resolveContentType, safeFileName, signToken, verifyToken, clearAuthCache } from './index.js'

// workerd provides FixedLengthStream; Node does not.
globalThis.FixedLengthStream ??= class extends TransformStream { constructor() { super() } }

const GROUP = '11111111-1111-4111-8111-111111111111'
const MAT = '22222222-2222-4222-8222-222222222222'
const env = {
  B2_KEY_ID: 'k', B2_APP_KEY: 's', B2_BUCKET_ID: 'bucket', B2_BUCKET_NAME: 'wynko',
  TOKEN_SECRET: 'secret', SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon',
}
const AUTH = { Authorization: 'Bearer user-jwt' }

let calls
let role
let rowForMint

function installFetch() {
  calls = []
  globalThis.fetch = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    calls.push({ url, init })
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'user-1' })
    if (url.includes('/rest/v1/group_members')) return Response.json(role ? [{ role }] : [])
    if (url.includes('/rest/v1/group_materials')) return Response.json(rowForMint ? [rowForMint] : [])
    if (url.includes('b2_authorize_account')) return Response.json({ apiUrl: 'https://api.b2', downloadUrl: 'https://dl.b2', authorizationToken: 'tok' })
    if (url.includes('b2_get_upload_url')) return Response.json({ uploadUrl: 'https://up.b2/u', authorizationToken: 'uptok' })
    if (url === 'https://up.b2/u') {
      if (init.body && typeof init.body.getReader === 'function') { const r = init.body.getReader(); while (!(await r.read()).done); }
      return Response.json({ ok: true })
    }
    if (url.includes('b2_list_file_names')) return Response.json({ files: [{ fileName: `${GROUP}/${MAT}/file/a.mp4`, fileId: 'f1' }], nextFileName: null })
    if (url.includes('b2_delete_file_version')) return Response.json({})
    if (url.startsWith('https://dl.b2/')) {
      const range = init.headers?.Range
      return range
        ? new Response('par', { status: 206, headers: { 'Content-Range': 'bytes 0-2/10', 'Content-Length': '3' } })
        : new Response('0123456789', { status: 200, headers: { 'Content-Length': '10' } })
    }
    return new Response('unexpected ' + url, { status: 500 })
  })
}

beforeEach(() => { role = 'admin'; rowForMint = null; clearAuthCache(); installFetch() })

const post = (path, init = {}) => worker.fetch(new Request('https://w.test' + path, { method: 'POST', ...init }), env)

describe('helpers', () => {
  it('resolves content types from mime, then extension', () => {
    expect(resolveContentType('video/mp4', 'x')).toBe('video/mp4')
    expect(resolveContentType('', 'lecture.MOV')).toBe('video/quicktime')
    expect(resolveContentType('text/html', 'page.html')).toBe('application/octet-stream')
    expect(resolveContentType(null, 'notes.docx')).toMatch(/wordprocessingml/)
  })
  it('makes safe names', () => { expect(safeFileName('My Lecture (1).mp4')).toBe('My_Lecture_1_.mp4'); expect(safeFileName('...')).toBe('file') })
  it('round-trips unicode tokens and rejects tampering/expiry', async () => {
    const t = await signToken({ key: 'k', fn: 'नोट्स.pdf', exp: Math.floor(Date.now() / 1e3) + 60 }, 'secret')
    expect((await verifyToken(t, 'secret')).fn).toBe('नोट्स.pdf')
    expect(await verifyToken(t + 'x', 'secret')).toBeNull()
    expect(await verifyToken(await signToken({ key: 'k', exp: 1 }, 'secret'), 'secret')).toBeNull()
  })
})

describe('POST /upload-file', () => {
  const q = `?group_id=${GROUP}&material_id=${MAT}&name=a.mp4`
  it('rejects non-admins and bad ids', async () => {
    role = 'member'
    expect((await post('/upload-file' + q, { headers: { ...AUTH, 'Content-Length': '3', 'Content-Type': 'video/mp4' }, body: 'abc' })).status).toBe(403)
    expect((await post('/upload-file?group_id=x&material_id=y', { headers: AUTH, body: 'abc' })).status).toBe(400)
    expect((await post('/upload-file' + q, { body: 'abc' })).status).toBe(401)
  })
  it('needs Content-Length and enforces the size cap', async () => {
    expect((await post('/upload-file' + q, { headers: AUTH, body: 'abc' })).status).toBe(411)
    const big = await post('/upload-file' + q, { headers: { ...AUTH, 'Content-Length': String(200 * 1024 * 1024) }, body: 'abc' })
    expect(big.status).toBe(413)
  })
  it('streams to B2 under group/material/file/name without hashing', async () => {
    const res = await post('/upload-file' + q, { headers: { ...AUTH, 'Content-Length': '3', 'Content-Type': 'video/mp4' }, body: 'abc' })
    expect(res.status).toBe(200)
    expect((await res.json()).key).toBe(`${GROUP}/${MAT}/file/a.mp4`)
    const put = calls.find(c => c.url === 'https://up.b2/u')
    expect(put.init.headers['X-Bz-Content-Sha1']).toBe('do_not_verify')
    expect(put.init.headers['X-Bz-File-Name']).toBe(encodeURIComponent(`${GROUP}/${MAT}/file/a.mp4`))
    expect(put.init.headers['Content-Type']).toBe('video/mp4')
  })
})

describe('mint-file + view', () => {
  it('only mints for b2-backed rows the caller can read', async () => {
    expect((await post('/mint-file', { headers: AUTH, body: JSON.stringify({ material_id: MAT }) })).status).toBe(403)
    rowForMint = { storage_path: `${GROUP}/${MAT}/old.mp4`, mime_type: 'video/mp4', file_name: 'old.mp4' } // legacy Supabase path
    expect((await post('/mint-file', { headers: AUTH, body: JSON.stringify({ material_id: MAT }) })).status).toBe(403)
  })
  it('serves video with Range support (206) and the right headers', async () => {
    rowForMint = { storage_path: `b2:${GROUP}/${MAT}/file/a.mp4`, mime_type: 'video/mp4', file_name: 'a.mp4' }
    const { token } = await (await post('/mint-file', { headers: AUTH, body: JSON.stringify({ material_id: MAT }) })).json()
    const full = await worker.fetch(new Request(`https://w.test/view/${token}`), env)
    expect(full.status).toBe(200)
    expect(full.headers.get('Content-Type')).toBe('video/mp4')
    expect(full.headers.get('Content-Disposition')).toBe('inline')
    expect(full.headers.get('Accept-Ranges')).toBe('bytes')
    const part = await worker.fetch(new Request(`https://w.test/view/${token}`, { headers: { Range: 'bytes=0-2' } }), env)
    expect(part.status).toBe(206)
    expect(part.headers.get('Content-Range')).toBe('bytes 0-2/10')
    expect(await part.text()).toBe('par')
  })
  it('forces download for docx and for explicit downloads, and reuses the B2 auth', async () => {
    rowForMint = { storage_path: `b2:${GROUP}/${MAT}/file/n.docx`, mime_type: '', file_name: 'n.docx' }
    const { token } = await (await post('/mint-file', { headers: AUTH, body: JSON.stringify({ material_id: MAT, download: 'Notes.docx' }) })).json()
    const res = await worker.fetch(new Request(`https://w.test/view/${token}`), env)
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="Notes.docx"/)
    await worker.fetch(new Request(`https://w.test/view/${token}`), env)
    expect(calls.filter(c => c.url.includes('b2_authorize_account')).length).toBe(1)
  })
  it('keeps the old page-view behaviour', async () => {
    const token = await signToken({ key: `${GROUP}/${MAT}/page-001.jpg`, exp: Math.floor(Date.now() / 1e3) + 60 }, 'secret')
    const res = await worker.fetch(new Request(`https://w.test/view/${token}`, { headers: { Range: 'bytes=0-2' } }), env)
    expect(res.status).toBe(200) // pages ignore Range, exactly as before
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
  })
})

describe('POST /delete', () => {
  it('is admin-only and deletes by group/material prefix', async () => {
    role = 'member'
    expect((await post(`/delete?group_id=${GROUP}&material_id=${MAT}`, { headers: AUTH })).status).toBe(403)
    role = 'admin'
    const res = await post(`/delete?group_id=${GROUP}&material_id=${MAT}`, { headers: AUTH })
    expect((await res.json()).deleted).toBe(1)
    const list = calls.find(c => c.url.includes('b2_list_file_names'))
    expect(JSON.parse(list.init.body).prefix).toBe(`${GROUP}/${MAT}/`)
  })
})

describe('CORS', () => {
  it('allows the Range header in preflight', async () => {
    const res = await worker.fetch(new Request('https://w.test/upload-file', { method: 'OPTIONS' }), env)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/Range/)
  })
})
