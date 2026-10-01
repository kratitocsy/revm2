import { sb } from '../../_shared/supabaseClient';

/* ============================================================
   Community Vault + announcement attachments (migration 0105).

   Rows live in group_materials:
     pdf / image  -> rasterised to JPEG pages, stored through the existing
                     materials Cloudflare Worker (group_material_pages), read
                     page-by-page with short-lived view tokens.
     doc / video / file -> stored as-is in the private 'community-files'
                     Storage bucket, read through short-lived signed URLs.

   in_vault = true  -> listed in the community's Vault.
   in_vault = false -> "just sent": only reachable from its announcement.
   ============================================================ */

const MATERIALS_WORKER_URL = 'https://revm2-materials-proxy.kiaro2244.workers.dev';
const RAW_BUCKET = 'community-files';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // matches the bucket limit
export const MAX_ATTACHMENTS_PER_ANNOUNCEMENT = 5;
const PAGE_RENDER_SCALE = 2.0;
const PAGE_MAX_DIM = 1800;
const JPEG_QUALITY = 0.8;

export type VaultKind = 'pdf' | 'image' | 'doc' | 'video' | 'file';

export interface VaultItem {
  id: string;
  group_id: string;
  title: string;
  source_type: VaultKind;
  page_count: number;
  mime_type: string | null;
  file_name: string | null;
  storage_path: string | null;
  original_size_bytes: number | null;
  in_vault: boolean;
  announcement_id: string | null;
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
  uploaded_by: string | null;
}

const ITEM_COLUMNS =
  'id, group_id, title, source_type, page_count, mime_type, file_name, storage_path, original_size_bytes, in_vault, announcement_id, status, created_at, uploaded_by';

function errMsg(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message || fallback;
  }
  return fallback;
}

/* ── classification (pure, unit-tested) ──────────────────────────────────── */

export function classifyFile(file: { name: string; type: string }): VaultKind {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') && type !== 'image/svg+xml') return 'image';
  if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/.test(name)) return 'video';
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'doc';
  return 'file';
}

/** Human message when a file can't be attached, or null when it's fine. */
export function validateAttachment(file: { name: string; size: number }): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Object-name-safe version of a file name (keeps the extension). */
export function safeObjectName(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(-80);
  return cleaned || 'file';
}

export function kindLabel(k: VaultKind): string {
  return k === 'pdf' ? 'PDF' : k === 'image' ? 'Image' : k === 'doc' ? 'Document' : k === 'video' ? 'Video' : 'File';
}

/** Vault tab groups: reading material vs media. */
export function isMedia(k: VaultKind): boolean {
  return k === 'image' || k === 'video';
}

/* ── upload ──────────────────────────────────────────────────────────────── */

async function accessToken(): Promise<string> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Not signed in.');
  return session.access_token;
}

async function uploadPageToWorker(groupId: string, materialId: string, pageNumber: number, blob: Blob): Promise<string> {
  const token = await accessToken();
  const url = `${MATERIALS_WORKER_URL}/upload?group_id=${encodeURIComponent(groupId)}&material_id=${encodeURIComponent(materialId)}&page=${pageNumber}&ext=jpg`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: blob });
  if (!res.ok) throw new Error(`Page ${pageNumber} upload failed (${res.status}).`);
  const json = (await res.json()) as { key: string };
  return json.key;
}

interface PageBlob { blob: Blob; width: number; height: number }

function compressImagePage(file: File): Promise<PageBlob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > PAGE_MAX_DIM) { height = Math.round((height * PAGE_MAX_DIM) / width); width = PAGE_MAX_DIM; }
      else if (height > PAGE_MAX_DIM) { width = Math.round((width * PAGE_MAX_DIM) / height); height = PAGE_MAX_DIM; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(src); reject(new Error('Could not process this image.')); return; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); // flatten transparency for JPEG
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(src);
        if (!blob) reject(new Error('Could not process this image.'));
        else resolve({ blob, width, height });
      }, 'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Could not read this image.')); };
    img.src = src;
  });
}

async function rasterizePdf(file: File, onProgress: (done: number, total: number) => void): Promise<PageBlob[]> {
  // pdf.js is big - only load it when a PDF is actually attached.
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: PageBlob[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: PAGE_RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not render this PDF.');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error(`Could not compress page ${i}.`);
    pages.push({ blob, width: canvas.width, height: canvas.height });
    onProgress(i, pdf.numPages);
    canvas.width = canvas.height = 0;
  }
  return pages;
}

export interface UploadOptions {
  title?: string;
  inVault: boolean;
  announcementId?: string | null;
  onStatus?: (s: string) => void;
}

/** Upload one file for a community. Admin-only (RLS enforces it). Returns the material id. */
export async function uploadAttachment(groupId: string, file: File, opts: UploadOptions): Promise<string> {
  const onStatus = opts.onStatus ?? (() => {});
  const invalid = validateAttachment(file);
  if (invalid) throw new Error(invalid);

  const kind = classifyFile(file);
  const title = (opts.title || file.name.replace(/\.[^.]+$/, '') || 'Untitled').slice(0, 120);

  // Rasterise first, so a broken PDF fails before any row exists.
  let pages: PageBlob[] = [];
  if (kind === 'pdf') {
    onStatus('Compressing…');
    pages = await rasterizePdf(file, (d, t) => onStatus(`Compressing page ${d}/${t}…`));
  } else if (kind === 'image') {
    onStatus('Compressing…');
    pages = [await compressImagePage(file)];
  }

  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Not signed in.');

  const { data: row, error: insErr } = await sb.from('group_materials').insert({
    group_id: groupId,
    uploaded_by: u.user.id,
    title,
    source_type: kind,
    page_count: pages.length,
    mime_type: file.type || null,
    file_name: file.name,
    original_size_bytes: file.size,
    compressed_size_bytes: pages.length ? pages.reduce((n, p) => n + p.blob.size, 0) : file.size,
    in_vault: opts.inVault,
    announcement_id: opts.announcementId ?? null,
    status: 'processing',
  }).select('id').single();
  if (insErr || !row) throw new Error(errMsg(insErr, 'Could not save the attachment'));
  const materialId = (row as { id: string }).id;

  try {
    if (pages.length) {
      for (let i = 0; i < pages.length; i++) {
        onStatus(`Uploading page ${i + 1}/${pages.length}…`);
        const key = await uploadPageToWorker(groupId, materialId, i + 1, pages[i].blob);
        const { error } = await sb.from('group_material_pages').insert({
          material_id: materialId, page_number: i + 1, storage_path: key, width: pages[i].width, height: pages[i].height,
        });
        if (error) throw new Error(errMsg(error, 'Could not save a page'));
      }
      await sb.from('group_materials').update({ status: 'ready' }).eq('id', materialId);
    } else {
      onStatus('Uploading…');
      const path = `${groupId}/${materialId}/${safeObjectName(file.name)}`;
      const { error } = await sb.storage.from(RAW_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (error) throw new Error(errMsg(error, 'Upload failed'));
      await sb.from('group_materials').update({ storage_path: path, status: 'ready' }).eq('id', materialId);
    }
    onStatus('Done.');
    return materialId;
  } catch (e) {
    await sb.from('group_materials').update({ status: 'failed' }).eq('id', materialId);
    throw e;
  }
}

/* ── read ────────────────────────────────────────────────────────────────── */

export async function fetchVault(groupId: string): Promise<VaultItem[]> {
  const { data, error } = await sb.from('group_materials').select(ITEM_COLUMNS)
    .eq('group_id', groupId).eq('in_vault', true).eq('status', 'ready')
    .order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(errMsg(error, 'Could not load the Vault'));
  return (data ?? []) as VaultItem[];
}

/** Every announcement attachment for the community (vault-saved or not). */
export async function fetchAnnouncementAttachments(groupId: string): Promise<VaultItem[]> {
  const { data, error } = await sb.from('group_materials').select(ITEM_COLUMNS)
    .eq('group_id', groupId).not('announcement_id', 'is', null).eq('status', 'ready')
    .order('created_at', { ascending: true }).limit(500);
  if (error) throw new Error(errMsg(error, 'Could not load attachments'));
  return (data ?? []) as VaultItem[];
}

export function groupByAnnouncement(items: VaultItem[]): Record<string, VaultItem[]> {
  const out: Record<string, VaultItem[]> = {};
  for (const it of items) {
    if (!it.announcement_id) continue;
    (out[it.announcement_id] ||= []).push(it);
  }
  return out;
}

export async function fetchPages(materialId: string): Promise<number[]> {
  const { data, error } = await sb.from('group_material_pages').select('page_number')
    .eq('material_id', materialId).order('page_number', { ascending: true });
  if (error) throw new Error(errMsg(error, 'Could not open this file'));
  return ((data ?? []) as { page_number: number }[]).map(p => p.page_number);
}

/** Short-lived URL for one rasterised page, minted by the materials Worker. */
export async function mintPageUrl(materialId: string, pageNumber: number): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${MATERIALS_WORKER_URL}/mint`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ material_id: materialId, page_number: pageNumber }),
  });
  if (!res.ok) throw new Error('Could not open this page.');
  const { token: viewToken } = (await res.json()) as { token: string };
  return `${MATERIALS_WORKER_URL}/view/${viewToken}`;
}

/** Short-lived signed URL for a raw file (docx / video / other). */
export async function signedFileUrl(path: string, opts: { download?: string; seconds?: number } = {}): Promise<string> {
  const { data, error } = await sb.storage.from(RAW_BUCKET)
    .createSignedUrl(path, opts.seconds ?? 300, opts.download ? { download: opts.download } : undefined);
  if (error || !data) throw new Error(errMsg(error, 'Could not open this file'));
  return data.signedUrl;
}

/* ── manage ──────────────────────────────────────────────────────────────── */

async function removeRaw(paths: string[]) {
  if (paths.length) await sb.storage.from(RAW_BUCKET).remove(paths); // best effort
}

export async function deleteVaultItem(item: VaultItem): Promise<void> {
  if (item.storage_path) await removeRaw([item.storage_path]);
  const { error } = await sb.from('group_materials').delete().eq('id', item.id);
  if (error) throw new Error(errMsg(error, 'Could not delete this file'));
}

/** Promote a "just sent" attachment into the Vault (or take it back out). */
export async function setInVault(id: string, inVault: boolean): Promise<void> {
  const { error } = await sb.from('group_materials').update({ in_vault: inVault }).eq('id', id);
  if (error) throw new Error(errMsg(error, 'Could not update the Vault'));
}

export async function renameVaultItem(id: string, title: string): Promise<void> {
  const t = title.trim().slice(0, 120);
  if (!t) throw new Error('Give it a title.');
  const { error } = await sb.from('group_materials').update({ title: t }).eq('id', id);
  if (error) throw new Error(errMsg(error, 'Could not rename this file'));
}

/** Raw files of "just sent" attachments are removed from Storage before the
 *  announcement (and, via trigger, those rows) is deleted. */
export async function cleanupUnsavedAttachmentFiles(announcementId: string): Promise<void> {
  const { data } = await sb.from('group_materials').select('storage_path')
    .eq('announcement_id', announcementId).eq('in_vault', false).not('storage_path', 'is', null);
  await removeRaw(((data ?? []) as { storage_path: string }[]).map(r => r.storage_path));
}
