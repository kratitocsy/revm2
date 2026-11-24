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
