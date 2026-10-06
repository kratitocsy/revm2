import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// home.html must load the dashboard bundle under the same URL its lazy-loaded
// chunks import it by (./home-app.js). Any difference, even a ?v= query, makes
// the browser run the whole app a second time the first time a chunk loads
// (voice, PDF or Word import), which resets the page and drops you out of the
// room you were in.
describe('home.html entry script', () => {
  const html = readFileSync(resolve(__dirname, '../../../../home.html'), 'utf8')
  const tag = html.match(/<script[^>]*type="module"[^>]*src="([^"]*home-app\.js[^"]*)"/)

  it('loads the dashboard bundle', () => {
    expect(tag).not.toBeNull()
  })
  it('without a query string or fragment', () => {
    expect(tag![1]).toBe('home-app-dist/home-app.js')
    expect(tag![1]).not.toMatch(/[?#]/)
  })
})
