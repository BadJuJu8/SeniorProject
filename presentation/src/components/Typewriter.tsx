import { useEffect, useRef, useState } from 'react'
import { useDeck } from '../deck'
import './Typewriter.css'

/**
 * Types a mono string at ~40 characters per second with a block cursor that
 * stops blinking when done. Layout space for the full string is reserved from
 * the start, so nothing below it moves while it types.
 */
export function Typewriter({
  text,
  cps = 40,
  delay = 0,
  onDone,
  className = '',
}: {
  text: string
  cps?: number
  delay?: number
  onDone?: () => void
  className?: string
}) {
  const { reduced } = useDeck()
  const [n, setN] = useState(reduced ? text.length : 0)
  const [done, setDone] = useState(reduced)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (reduced) {
      setN(text.length)
      setDone(true)
      onDoneRef.current?.()
      return
    }
    let i = 0
    let interval: number | undefined
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        i += 1
        setN(i)
        if (i >= text.length) {
          window.clearInterval(interval)
          setDone(true)
          onDoneRef.current?.()
        }
      }, 1000 / cps)
    }, delay * 1000)
    return () => {
      window.clearTimeout(start)
      if (interval) window.clearInterval(interval)
    }
  }, [text, cps, delay, reduced])

  return (
    <span className={`tw mono ${className}`}>
      <span className="tw-ghost" aria-hidden>
        {text}
        <span className="tw-cursor" />
      </span>
      <span className="tw-live">
        {text.slice(0, n)}
        <span className={`tw-cursor ${done ? 'tw-cursor--done' : 'tw-cursor--blink'}`} />
      </span>
    </span>
  )
}
