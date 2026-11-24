import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  JEE_MAIN_2023_TOP_200 as set, PYQ_SETS, chaptersOf, checkAnswer, loadProgress, parseNumeric,
  questionImageUrl, saveProgress, summarize,
} from './edunitiPyqs'

const byN = (n: number) => set.questions.find(q => q.n === n)!

describe('JEE Main 2023 Top 200 data', () => {
  it('has questions 1..200 in order, once each', () => {
    expect(set.questions.map(q => q.n)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1))
  })

  it('splits into chapters with the counts printed in the PDF index', () => {
    const counts = new Map<string, number>()
    for (const q of set.questions) counts.set(q.chapter, (counts.get(q.chapter) ?? 0) + 1)
    expect([...counts.values()]).toEqual([8, 7, 2, 10, 3, 9, 6, 6, 6, 7, 4, 8, 7, 11, 6, 14, 10, 11, 5, 13, 8, 3, 6, 30])
    expect(chaptersOf(set)).toHaveLength(24)
  })

  it('keeps every multiple-choice answer within options 1-4', () => {
    for (const q of set.questions.filter(q => q.kind === 'mcq')) {
      expect([1, 2, 3, 4]).toContain(q.answer)
    }
  })

  it('has a picture on disk for every question', () => {
    for (const q of set.questions) {
      const file = resolve(__dirname, '../../../..', questionImageUrl(set, q.n).replace(/^\//, ''))
      expect(existsSync(file), file).toBe(true)
    }
  })

  it('applies the corrections printed in the PDF', () => {
    expect(byN(26).answer).toBe(-245) // NTA gave 245, the key says -245
    expect(byN(26).note).toBeTruthy()
    const removed = set.questions.filter(q => q.removed).map(q => q.n)
    expect(removed).toEqual([67, 70, 77, 80, 101, 137, 177, 180, 189])
  })

  it('spot-checks answers against the official key', () => {
    expect(byN(1).answer).toBe(4)
    expect(byN(64).answer).toBe(1150)
    expect(byN(193).answer).toBe(4125)
    expect(byN(200).answer).toBe(2)
  })

  it('is registered in PYQ_SETS with unique ids', () => {
    expect(PYQ_SETS).toContain(set)
    expect(new Set(PYQ_SETS.map(s => s.id)).size).toBe(PYQ_SETS.length)
  })
})

describe('questionImageUrl', () => {
  it('zero-pads the question number', () => {
    expect(questionImageUrl(set, 7)).toBe('/assets/eduniti/jee-main-2023/q007.webp')
    expect(questionImageUrl(set, 200)).toBe('/assets/eduniti/jee-main-2023/q200.webp')
  })
})

describe('parseNumeric', () => {
  it('accepts plain, signed, decimal and comma-grouped numbers', () => {
    expect(parseNumeric('245')).toBe(245)
    expect(parseNumeric(' -245 ')).toBe(-245)
    expect(parseNumeric('2.5')).toBe(2.5)
    expect(parseNumeric('.5')).toBe(0.5)
    expect(parseNumeric('1,150')).toBe(1150)
  })
  it('rejects anything else', () => {
    for (const bad of ['', '  ', 'abc', '12a', '1e3', '--5', '1.2.3', 'Infinity']) expect(parseNumeric(bad)).toBeNull()
  })
})

describe('checkAnswer', () => {
  it('checks multiple-choice by option number', () => {
    const q = byN(1) // mcq, answer 4
    expect(q.kind).toBe('mcq')
    expect(checkAnswer(q, '4')).toBe('correct')
    expect(checkAnswer(q, '2')).toBe('wrong')
    expect(checkAnswer(q, '5')).toBe('invalid')
    expect(checkAnswer(q, '')).toBe('invalid')
  })
  it('checks numerical answers, including negatives', () => {
    const q = byN(26)
    expect(q.kind).toBe('num')
    expect(checkAnswer(q, '-245')).toBe('correct')
    expect(checkAnswer(q, '245')).toBe('wrong')
    expect(checkAnswer(q, 'x')).toBe('invalid')
  })
})

describe('progress storage', () => {
  const fake = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }
  it('round-trips and summarizes', () => {
    const st = fake()
    saveProgress(set.id, { 1: { response: '4', correct: true }, 2: { response: '1', correct: false } }, st)
    const back = loadProgress(set.id, st)
    expect(back[1]).toEqual({ response: '4', correct: true })
    expect(summarize(set, back)).toEqual({ total: 200, attempted: 2, correct: 1 })
  })
  it('ignores corrupt or malformed saved data', () => {
    const st = fake()
    st.setItem(`wynko.pyq.${set.id}`, '{not json')
    expect(loadProgress(set.id, st)).toEqual({})
    st.setItem(`wynko.pyq.${set.id}`, JSON.stringify({ 1: { response: 4 }, 2: 'x', 3: { response: '2', correct: true } }))
    expect(Object.keys(loadProgress(set.id, st))).toEqual(['3'])
    st.setItem(`wynko.pyq.${set.id}`, '[1,2]')
    expect(loadProgress(set.id, st)).toEqual({})
  })
  it('does not throw when storage is unavailable', () => {
    expect(loadProgress(set.id, null)).toEqual({})
    expect(() => saveProgress(set.id, {}, null)).not.toThrow()
  })
})
