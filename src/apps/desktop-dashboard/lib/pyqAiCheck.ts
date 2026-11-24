/* ============================================================
   pyqAiCheck.ts

   Asks the pyq-classify edge function (Gemini) whether each unsure question
   picture shows options or asks for a number. Only the pictures of unsure
   questions are sent, never the whole PDF. Failing quietly is fine: the
   student can still set them by hand on the review screen.
   ============================================================ */

import { sb } from '../../_shared/supabaseClient'

export const AI_CHECK_MAX = 80

async function toBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function aiClassify(items: { n: number; image: Blob }[]): Promise<Record<number, 'mcq' | 'num'>> {
  const images = await Promise.all(items.slice(0, AI_CHECK_MAX).map(async it => ({
    id: it.n,
    mime: it.image.type === 'image/jpeg' || it.image.type === 'image/png' ? it.image.type : 'image/webp',
    data: await toBase64(it.image),
  })))
  if (images.length === 0) return {}
  const { data, error } = await sb.functions.invoke('pyq-classify', { body: { images } })
  if (error) {
    let message = error.message
    try { message = (await (error as { context?: Response }).context?.json())?.error ?? message } catch { /* keep default */ }
    throw new Error(message || 'AI check failed')
  }
  const out: Record<number, 'mcq' | 'num'> = {}
  for (const [k, v] of Object.entries((data as { results?: Record<string, string> })?.results ?? {})) {
    if (v === 'mcq' || v === 'num') out[Number(k)] = v
  }
  return out
}
