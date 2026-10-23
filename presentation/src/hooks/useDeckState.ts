import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { slides } from '../slides'

/**
 * One source of truth for where the deck is: slide + fragment, hash sync,
 * BroadcastChannel sync between the main and presenter windows, keyboard
 * bindings and the presenter timer start.
 *
 * Hash format: #/<slide 1-based>/<fragment 0-based>
 */

export type Role = 'main' | 'presenter'

export interface Pos {
  slide: number
  fragment: number
}

interface State extends Pos {
  direction: 1 | -1
  /** epoch ms of the first advance; drives the presenter timer */
  startedAt: number | null
  /** 'remote' changes came in over the channel and must not be re-broadcast */
  source: 'local' | 'remote'
}

type Action =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; slide: number; fragment?: number }
  | { type: 'remote'; slide: number; fragment: number; startedAt: number | null; direction: 1 | -1 }

const last = slides.length - 1
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function parseHash(hash = location.hash): Pos | null {
  const m = /^#\/(\d+)(?:\/(\d+))?/.exec(hash)
  if (!m) return null
  const slide = clamp(parseInt(m[1], 10) - 1, 0, last)
  const fragment = clamp(parseInt(m[2] ?? '0', 10), 0, slides[slide].fragments)
  return { slide, fragment }
}

export const toHash = (p: Pos) => `#/${p.slide + 1}/${p.fragment}`

function started(s: State, moved: boolean): number | null {
  return s.startedAt ?? (moved ? Date.now() : null)
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'next': {
      if (s.fragment < slides[s.slide].fragments) {
        return { ...s, fragment: s.fragment + 1, direction: 1, source: 'local', startedAt: started(s, true) }
      }
      if (s.slide < last) {
        return { ...s, slide: s.slide + 1, fragment: 0, direction: 1, source: 'local', startedAt: started(s, true) }
      }
      return s
    }
    case 'prev': {
      if (s.fragment > 0) {
        return { ...s, fragment: s.fragment - 1, direction: -1, source: 'local', startedAt: started(s, true) }
      }
      if (s.slide > 0) {
        const slide = s.slide - 1
        return { ...s, slide, fragment: slides[slide].fragments, direction: -1, source: 'local', startedAt: started(s, true) }
      }
      return s
    }
    case 'goto': {
      const slide = clamp(a.slide, 0, last)
      const fragment = clamp(a.fragment ?? 0, 0, slides[slide].fragments)
      if (slide === s.slide && fragment === s.fragment) return s
      const direction: 1 | -1 = slide > s.slide || (slide === s.slide && fragment > s.fragment) ? 1 : -1
      return { ...s, slide, fragment, direction, source: 'local', startedAt: started(s, true) }
    }
    case 'remote': {
      if (a.slide === s.slide && a.fragment === s.fragment && a.startedAt === s.startedAt) return s
      return { slide: a.slide, fragment: a.fragment, direction: a.direction, startedAt: a.startedAt ?? s.startedAt, source: 'remote' }
    }
  }
}

type Msg =
  | { type: 'hello' }
  | { type: 'state'; slide: number; fragment: number; startedAt: number | null; direction: 1 | -1 }

export function useDeckState(role: Role) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    const p = parseHash() ?? { slide: 0, fragment: 0 }
    return { ...p, direction: 1 as const, startedAt: null, source: 'local' as const }
  })

  // ui state local to this window
  const [black, setBlack] = useState(false)
  const [overview, setOverview] = useState(false)
  const [help, setHelp] = useState(false)
  const [buffer, setBuffer] = useState('')

  const channel = useRef<BroadcastChannel | null>(null)

  // ---- hash: write on change, read on manual edit ----
  useEffect(() => {
    const h = toHash(state)
    if (location.hash !== h) history.replaceState(null, '', `${location.pathname}${location.search}${h}`)
  }, [state.slide, state.fragment])

  useEffect(() => {
    const onHash = () => {
      const p = parseHash()
      if (p) dispatch({ type: 'goto', slide: p.slide, fragment: p.fragment })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // ---- BroadcastChannel: either window can drive ----
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel('deck')
    channel.current = ch
    const post = () => {
      const s = stateRef.current
      ch.postMessage({ type: 'state', slide: s.slide, fragment: s.fragment, startedAt: s.startedAt, direction: s.direction } satisfies Msg)
    }
    ch.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data
      if (m.type === 'hello') post()
      else if (m.type === 'state') dispatch({ type: 'remote', slide: m.slide, fragment: m.fragment, startedAt: m.startedAt, direction: m.direction })
    }
    ch.postMessage({ type: 'hello' } satisfies Msg)
    return () => {
      ch.close()
      channel.current = null
    }
  }, [])

  useEffect(() => {
    if (state.source !== 'local' || !channel.current) return
    channel.current.postMessage({
      type: 'state',
      slide: state.slide,
      fragment: state.fragment,
      startedAt: state.startedAt,
      direction: state.direction,
    } satisfies Msg)
  }, [state])

  // ---- actions ----
  const next = useCallback(() => dispatch({ type: 'next' }), [])
  const prev = useCallback(() => dispatch({ type: 'prev' }), [])
  const goTo = useCallback((slide: number, fragment = 0) => dispatch({ type: 'goto', slide, fragment }), [])
  const first = useCallback(() => dispatch({ type: 'goto', slide: 0, fragment: 0 }), [])
  const lastSlide = useCallback(() => dispatch({ type: 'goto', slide: last, fragment: 0 }), [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()
  }, [])

  const openPresenter = useCallback(() => {
    const s = stateRef.current
    window.open(`${location.pathname}?presenter${toHash(s)}`, 'deck-presenter', 'width=1400,height=900')
  }, [])

  // ---- keyboard ----
  const ui = useRef({ buffer, overview, help })
  ui.current = { buffer, overview, help }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const k = e.key
      const { buffer, overview, help } = ui.current

      if (/^\d$/.test(k)) {
        setBuffer((b) => (b + k).slice(-3))
        e.preventDefault()
        return
      }
      if (k === 'Enter') {
        if (buffer) {
          goTo(parseInt(buffer, 10) - 1, 0)
          setBuffer('')
          setOverview(false)
        } else if (overview) setOverview(false)
        e.preventDefault()
        return
      }
      if (k === 'Backspace' && buffer) {
        setBuffer((b) => b.slice(0, -1))
        e.preventDefault()
        return
      }

      switch (k) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
        case 'n':
        case 'N':
          next()
          break
        case 'ArrowLeft':
        case 'PageUp':
        case 'p':
        case 'P':
          prev()
          break
        case 'Home':
          first()
          break
        case 'End':
          lastSlide()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'b':
        case 'B':
          if (role === 'main') setBlack((v) => !v)
          break
        case 's':
        case 'S':
          if (role === 'main') openPresenter()
          break
        case 'Escape':
          if (help) setHelp(false)
          else if (buffer) setBuffer('')
          else if (role === 'main') setOverview((v) => !v)
          break
        case '?':
          setHelp((v) => !v)
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [role, next, prev, first, lastSlide, goTo, toggleFullscreen, openPresenter])

  return {
    slide: state.slide,
    fragment: state.fragment,
    direction: state.direction,
    startedAt: state.startedAt,
    black,
    overview,
    help,
    buffer,
    next,
    prev,
    goTo,
    first,
    last: lastSlide,
    setOverview,
    setHelp,
    toggleFullscreen,
    openPresenter,
  }
}

export type DeckApi = ReturnType<typeof useDeckState>
