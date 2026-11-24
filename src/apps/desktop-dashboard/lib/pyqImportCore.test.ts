import { describe, expect, it } from 'vitest'
import { parseCorrections, parseKeyLines, parseRemoved, parseSentenceKey, readKeyAnswer } from './pyqImportCore'

describe('readKeyAnswer', () => {
  it('reads letters as options, small whole numbers as unsure options, the rest as numerical', () => {
    expect(readKeyAnswer('c')).toEqual({ kind: 'mcq', answer: 3, unsure: false })
    expect(readKeyAnswer('(B)')).toEqual({ kind: 'mcq', answer: 2, unsure: false })
    expect(readKeyAnswer('3')).toEqual({ kind: 'mcq', answer: 3, unsure: true })
    expect(readKeyAnswer('673')).toEqual({ kind: 'num', answer: 673, unsure: false })
    expect(readKeyAnswer('-245')).toEqual({ kind: 'num', answer: -245, unsure: false })
    expect(readKeyAnswer('0.5')).toEqual({ kind: 'num', answer: 0.5, unsure: false })
  })
  it('returns null for text it cannot read', () => {
    expect(readKeyAnswer(undefined)).toBeNull()
    expect(readKeyAnswer('G/20')).toBeNull()
  })
})

describe('parseKeyLines', () => {
  it('reads several "n. answer" pairs from one line', () => {
    expect(parseKeyLines(['1. 3 32. 3 63. 4', '10. 673'])).toEqual({ 1: '3', 32: '3', 63: '4', 10: '673' })
  })
})

describe('parseSentenceKey', () => {
  it('reads answers written as sentences', () => {
    const text = '19. 2 20. Dropped (Correct Answer is 32) 21. 2 31 2 (NTA assumed friction on the 2m path only) 198. NTA gave 5 (It should be 15) 199. 4'
    expect(parseSentenceKey(text)).toEqual({ 20: '32', 31: '2', 198: '15' })
  })
  it('uses the exact answer when the key says the printed one should be different', () => {
    expect(parseSentenceKey('71. 3 (Exact answer should be 2469.3) 72. 1')).toEqual({ 71: '2469.3' })
  })
  it('leaves out entries it cannot read with confidence', () => {
    expect(parseSentenceKey('102. Correct Answer is G/20 103. 3 151. 0.20 (But final answer will be Zero) 152. 1')).toEqual({})
  })
})

describe('parseCorrections and parseRemoved', () => {
  it('reads a correction', () => {
    expect(parseCorrections('Q26 : NTA gave 245 as answer but it should be -245')).toEqual({ 26: '-245' })
  })
  it('reads the list of removed-topic questions', () => {
    expect(parseRemoved('List of questions based on removed topics : 67, 70, 77 & 189')).toEqual([67, 70, 77, 189])
    expect(parseRemoved('nothing here')).toEqual([])
  })
})

describe('more sentence answers', () => {
  it('keeps the printed answer when the note does not give another number', () => {
    expect(parseSentenceKey('185. 2 186. 1 ( Although ¼ is answer NTA gave option 1 ) 187. 4')).toEqual({ 186: '1' })
    expect(parseSentenceKey('3. 2 ( LIST II Matrix IV should be A/m ) 4 . 2')).toEqual({ 3: '2' })
  })
})

describe('keyStyle', () => {
  it('treats 1-4 as options when the paper has no other answers', async () => {
    const { keyStyle, applyKeyStyle, readKeyAnswer } = await import('./pyqImportCore')
    expect(keyStyle({ 1: '3', 2: 'b', 3: '1' })).toBe('optionsOnly')
    expect(applyKeyStyle(readKeyAnswer('3'), 'optionsOnly')).toEqual({ kind: 'mcq', answer: 3, unsure: false })
  })
  it('treats 1-4 as numerical when options are written as letters', async () => {
    const { keyStyle, applyKeyStyle, readKeyAnswer } = await import('./pyqImportCore')
    expect(keyStyle({ 1: 'A', 2: 'C', 3: '266', 4: '2', 5: 'D' })).toBe('letterOptions')
    expect(applyKeyStyle(readKeyAnswer('2'), 'letterOptions')).toEqual({ kind: 'num', answer: 2, unsure: false })
  })
  it('leaves 1-4 to be checked when options are digits and numericals exist', async () => {
    const { keyStyle } = await import('./pyqImportCore')
    expect(keyStyle({ 1: '3', 2: '673', 3: '2', 4: '1', 5: '4' })).toBe('mixed')
  })
})

describe('question numbers printed without a dot', () => {
  it('finds a bare or split number only where the real label is missing', async () => {
    const { planImport } = await import('./pyqImportCore')
    const item = (s: string, x: number, y: number) => ({ s, x, y, w: s.length * 5.5, h: 11 })
    const filler = (y: number, x: number) => item('some question text here', x + 15, y + 15)
    const page = {
      w: 540, h: 780, links: [],
      items: [
        item('1.', 10, 60), filler(60, 10), item('2.', 10, 200), filler(200, 10),
        item('3', 10, 340), item('.', 15.6, 340), filler(340, 10), // dot drawn as its own piece
        item('1', 280, 60), item('4', 285.6, 60), filler(60, 280), // "14" split in two
        item('4.', 280, 200), filler(200, 280),
      ],
    }
    // Numbers 5..13 on a second page keep the run going.
    const page2 = { w: 540, h: 780, links: [], items: [5, 6, 7, 8, 9, 10, 11, 12, 13].flatMap((n, i) => [item(`${n}.`, 10, 60 + i * 70), filler(60 + i * 70, 10)]) }
    const plan = planImport([page as any, page2 as any])
    const ns = plan.questions.map(q => q.n)
    expect(ns.slice(0, 4)).toEqual([1, 2, 3, 4])
    expect(plan.warnings.filter(w => /not found/.test(w))).toEqual([])
  })
})
