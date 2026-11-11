import { ComponentType } from 'react'

export interface TimeWindow {
  /** seconds */
  start: number
  end: number
}

export interface SlideDef {
  id: string
  section: string
  /** number of step reveals on the slide */
  fragments: number
  /** speaker notes, verbatim, with the time window at the start */
  notes: string
  timeWindow: TimeWindow | null
  Component: ComponentType
}

/** "0:55 to 1:50." -> { start: 55, end: 110 } */
export function windowFromNotes(notes: string): TimeWindow | null {
  const m = /^(\d+):(\d\d) to (\d+):(\d\d)\./.exec(notes)
  if (!m) return null
  return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] }
}
