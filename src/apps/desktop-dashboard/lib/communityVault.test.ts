import { describe, expect, it } from 'vitest'
import { classifyFile, formatBytes, groupByAnnouncement, isMedia, safeObjectName, validateAttachment, MAX_UPLOAD_BYTES, type VaultItem } from './communityVault'

describe('classifyFile', () => {
  it('detects the supported kinds by mime or extension', () => {
    expect(classifyFile({ name: 'notes.PDF', type: '' })).toBe('pdf')
    expect(classifyFile({ name: 'x', type: 'application/pdf' })).toBe('pdf')
    expect(classifyFile({ name: 'p.png', type: 'image/png' })).toBe('image')
    expect(classifyFile({ name: 'lec.mp4', type: 'video/mp4' })).toBe('video')
    expect(classifyFile({ name: 'lec.MOV', type: '' })).toBe('video')
    expect(classifyFile({ name: 'a.docx', type: '' })).toBe('doc')
  })
  it('treats SVG, legacy .doc and unknown types as plain files', () => {
    expect(classifyFile({ name: 'a.svg', type: 'image/svg+xml' })).toBe('file')
    expect(classifyFile({ name: 'a.doc', type: 'application/msword' })).toBe('file')
    expect(classifyFile({ name: 'a.zip', type: 'application/zip' })).toBe('file')
  })
})

describe('validateAttachment', () => {
  it('rejects empty and oversized files', () => {
    expect(validateAttachment({ name: 'a.pdf', size: 0 })).toMatch(/empty/)
    expect(validateAttachment({ name: 'a.pdf', size: MAX_UPLOAD_BYTES + 1 })).toMatch(/limit/)
    expect(validateAttachment({ name: 'a.pdf', size: 1024 })).toBeNull()
  })
})

describe('helpers', () => {
  it('formats sizes', () => {
    expect(formatBytes(null)).toBe('')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('makes object-safe names', () => {
    expect(safeObjectName('My Notes (final)/v2.pdf')).toBe('My_Notes_final_v2.pdf')
    expect(safeObjectName('...')).toBe('file')
  })
  it('splits media from documents', () => {
    expect(isMedia('image')).toBe(true)
    expect(isMedia('video')).toBe(true)
    expect(isMedia('pdf')).toBe(false)
  })
  it('groups attachments by announcement', () => {
    const mk = (id: string, a: string | null) => ({ id, announcement_id: a }) as VaultItem
    const g = groupByAnnouncement([mk('1', 'a'), mk('2', 'a'), mk('3', null), mk('4', 'b')])
    expect(Object.keys(g).sort()).toEqual(['a', 'b'])
    expect(g.a.map(i => i.id)).toEqual(['1', '2'])
  })
})
