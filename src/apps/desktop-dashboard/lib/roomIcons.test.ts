import { test, expect } from 'vitest'
import { pickRoomIcon } from './roomIcons'
test('x',()=>{
  expect(pickRoomIcon('NEET UG','All Subjects')).toBe('stethoscope')
  expect(pickRoomIcon('UPSC CSE','All Subjects')).toBe('landmark')
  expect(pickRoomIcon('mates','All Subjects')).toBe('book-open')
  expect(pickRoomIcon('JEE Main 2027','Physics')).toBe('atom')
  expect(pickRoomIcon('Night owls','Chemistry')).toBe('flask')
})
