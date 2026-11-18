import { describe, it, expect } from 'vitest'
import { pushBack, handleBack, backDepth } from './backStack'

describe('backStack', () => {
  it('returns false when nothing is open', () => {
    expect(handleBack()).toBe(false)
  })

  it('closes the newest handler first', () => {
    const closed: string[] = []
    pushBack(() => closed.push('room'))
    pushBack(() => closed.push('wynky'))
    expect(handleBack()).toBe(true)
    expect(handleBack()).toBe(true)
    expect(closed).toEqual(['wynky', 'room'])
    expect(backDepth()).toBe(0)
  })

  it('drops a handler that was removed when its panel closed on its own', () => {
    let closed = false
    const remove = pushBack(() => { closed = true })
    remove()
    expect(handleBack()).toBe(false)
    expect(closed).toBe(false)
  })
})
