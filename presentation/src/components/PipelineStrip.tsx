import { Fragment as ReactFragment, useEffect, useState } from 'react'
import { useDeck } from '../deck'
import './PipelineStrip.css'

export interface StripNode {
  label: string
  /** orange fill behind the label: the node to look at */
  accent?: boolean
  /** the run halts here; later nodes stay muted */
  stopped?: boolean
}

type NodeState = 'idle' | 'pending' | 'pass' | 'stopped'

/**
 * Four or five mono labels on a horizontal line, each with a status dot.
 * With `run`, the dots light up left to right 600 ms apart on mount, pass
 * green with the label brightening. A `stopped` node halts the run there.
 * Every lit state also says its word, so color never carries the meaning alone.
 */
export function PipelineStrip({ nodes, run = false, className = '' }: { nodes: StripNode[]; run?: boolean; className?: string }) {
  const { reduced } = useDeck()
  const stopAt = nodes.findIndex((n) => n.stopped)
  const target = stopAt >= 0 ? stopAt + 1 : nodes.length
  const [lit, setLit] = useState(run && reduced ? target : 0)

  useEffect(() => {
    if (!run) return
    if (reduced) {
      setLit(target)
      return
    }
    const timers: number[] = []
    for (let i = 1; i <= target; i++) timers.push(window.setTimeout(() => setLit(i), 400 + (i - 1) * 600))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [run, reduced, target])

  const stateOf = (i: number): NodeState => {
    if (!run) return 'idle'
    if (i >= lit) return 'pending'
    return nodes[i].stopped ? 'stopped' : 'pass'
  }

  return (
    <div className={`strip ${run ? 'strip--run' : ''} ${className}`} role="list">
      {nodes.map((n, i) => {
        const st = stateOf(i)
        return (
          <ReactFragment key={n.label}>
            {i > 0 && <div className="strip-seg" data-lit={st === 'pass' || st === 'stopped'} aria-hidden />}
            <div className="strip-node" data-state={st} role="listitem">
              <div className="strip-row">
                <span className="strip-dot" aria-hidden />
                <span className={`strip-label mono ${n.accent ? 'strip-label--accent' : ''}`}>{n.label}</span>
                {run && <span className="strip-status mono">{st}</span>}
              </div>
            </div>
          </ReactFragment>
        )
      })}
    </div>
  )
}
