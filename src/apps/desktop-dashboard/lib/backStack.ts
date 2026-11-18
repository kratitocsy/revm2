import { useEffect, useRef } from 'react'

// In-page "back" handlers for the Android app's hardware Back button.
// Anything that behaves like a screen or a dialog (Wynky, an open study room,
// a community page) registers a close function while it is open; the Android
// shell calls window.__wkBack() first and only leaves the page when nothing
// was open (it returns false).

type Handler = () => void

const stack: Handler[] = []

/** Registers [close] as the newest back handler. Call the returned function when it closes on its own. */
export function pushBack(close: Handler): () => void {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Runs the newest handler. Returns true when something was closed. */
export function handleBack(): boolean {
  const close = stack.pop()
  if (!close) return false
  close()
  return true
}

export function backDepth(): number { return stack.length }

if (typeof window !== 'undefined') (window as any).__wkBack = handleBack

/** While [active], Back calls [close]. The latest [close] is always used. */
export function useBackHandler(active: boolean, close: () => void): void {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!active) return
    return pushBack(() => ref.current())
  }, [active])
}
