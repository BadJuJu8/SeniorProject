import { useEffect, useRef, useState } from 'react'
import { animate, motion, Variants } from 'framer-motion'
import { Item, Stagger, useDeck } from '../deck'
import './LabMap.css'

const lineItem: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } },
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br'

export interface Host {
  id: string
  name: string
  ip?: string
  desc: string
  corner: Corner
  accent?: boolean
}

export interface Connector {
  from: string
  to: string
  label: string
  accent?: boolean
}

/* geometry of the 1664 x 560 area */
const W = 1664
const H = 560
const BW = 480
const BH = 200
const LABEL_H = 24
const GAP = 16

type Pt = { x: number; y: number }

const boxAt = (c: Corner) => ({
  x: c === 'tl' || c === 'bl' ? 0 : W - BW,
  y: c === 'tl' || c === 'tr' ? 0 : H - BH,
})

type Orientation = 'h' | 'v' | 'd'

function endpoints(a: Corner, b: Corner): { p1: Pt; p2: Pt; o: Orientation } {
  const A = boxAt(a)
  const B = boxAt(b)
  const sameRow = A.y === B.y
  const sameCol = A.x === B.x
  if (sameRow) {
    const [L, R] = A.x < B.x ? [A, B] : [B, A]
    return { p1: { x: L.x + BW, y: L.y + BH / 2 }, p2: { x: R.x, y: R.y + BH / 2 }, o: 'h' }
  }
  if (sameCol) {
    const [T, Bt] = A.y < B.y ? [A, B] : [B, A]
    return { p1: { x: T.x + BW / 2, y: T.y + BH }, p2: { x: Bt.x + BW / 2, y: Bt.y }, o: 'v' }
  }
  // diagonal: from the inner-facing corner regions of each box
  const [Lo, Up] = A.y > B.y ? [A, B] : [B, A] // lower box, upper box
  const lowerRight = Lo.x < Up.x
  const p1 = { x: lowerRight ? Lo.x + BW - 40 : Lo.x + 40, y: Lo.y }
  const p2 = { x: lowerRight ? Up.x + 40 : Up.x + BW - 40, y: Up.y + BH }
  return { p1, p2, o: 'd' }
}

/**
 * Four host boxes at the corners of a 1664 x 560 area with SVG connectors
 * between them and 24px mono labels on the connectors. On entry a 10px dot
 * travels once along the `travel` legs in sequence. Reduced motion: no dot.
 */
export function LabMap({
  hosts,
  connectors,
  travel = [],
}: {
  hosts: Host[]
  connectors: Connector[]
  travel?: [string, string][]
}) {
  const { reduced } = useDeck()
  const corner = (id: string) => hosts.find((h) => h.id === id)!.corner
  const lines = connectors.map((c) => ({ ...c, ...endpoints(corner(c.from), corner(c.to)) }))

  // ---- travelling dot ----
  const dotRef = useRef<SVGCircleElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (reduced || travel.length === 0) return
    let cancelled = false
    const controls: { stop: () => void }[] = []
    const legs = travel.map(([f, t]) => {
      const cf = corner(f)
      const ct = corner(t)
      const e = endpoints(cf, ct)
      // endpoints() orders by position; make the dot go from `f` to `t`
      const A = boxAt(cf)
      const forward = e.o === 'h' ? A.x < boxAt(ct).x : e.o === 'v' ? A.y < boxAt(ct).y : A.y > boxAt(ct).y
      return forward ? [e.p1, e.p2] : [e.p2, e.p1]
    })
    const run = async () => {
      await new Promise((r) => setTimeout(r, 700))
      if (cancelled) return
      setVisible(true)
      for (const [a, b] of legs) {
        if (cancelled) return
        await new Promise<void>((resolve) => {
          const c = animate(0, 1, {
            duration: 1.1,
            ease: 'easeInOut',
            onUpdate: (t) => {
              const el = dotRef.current
              if (!el) return
              el.setAttribute('cx', String(a.x + (b.x - a.x) * t))
              el.setAttribute('cy', String(a.y + (b.y - a.y) * t))
            },
            onComplete: resolve,
          })
          controls.push(c)
        })
        await new Promise((r) => setTimeout(r, 150))
      }
      if (!cancelled) setVisible(false)
    }
    void run()
    return () => {
      cancelled = true
      controls.forEach((c) => c.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced])

  return (
    <div className="labmap" style={{ width: W, height: H }}>
      <svg className="labmap-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
        <motion.g
          initial={reduced ? false : 'hidden'}
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.3 } } }}
        >
          {lines.map((l) => (
            <motion.line
              key={l.label}
              variants={lineItem}
              x1={l.p1.x}
              y1={l.p1.y}
              x2={l.p2.x}
              y2={l.p2.y}
              className={`labmap-line ${l.accent ? 'labmap-line--accent' : ''}`}
            />
          ))}
        </motion.g>
        {visible && <circle ref={dotRef} r={5} className="labmap-dot" cx={-20} cy={-20} />}
      </svg>

      {/* connector labels are HTML so they can be measured and wrap-checked */}
      <Stagger delay={0.3} style={{ display: 'contents' }}>
      {lines.map((l) => {
        const mid = { x: (l.p1.x + l.p2.x) / 2, y: (l.p1.y + l.p2.y) / 2 }
        let style: React.CSSProperties
        if (l.o === 'h') {
          const above = mid.y < H / 2
          style = {
            left: mid.x,
            top: above ? mid.y - GAP - LABEL_H : mid.y + GAP,
            transform: 'translateX(-50%)',
          }
        } else if (l.o === 'v') {
          const leftSide = mid.x < W / 2
          style = leftSide
            ? { left: mid.x + GAP, top: mid.y - LABEL_H / 2 }
            : { right: W - mid.x + GAP, top: mid.y - LABEL_H / 2 }
        } else {
          const angle = (Math.atan2(l.p2.y - l.p1.y, l.p2.x - l.p1.x) * 180) / Math.PI
          style = {
            left: mid.x,
            top: mid.y,
            transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${GAP + LABEL_H / 2}px)`,
          }
        }
        // positioning transform lives on a plain wrapper: Framer owns `transform` on the animated child
        return (
          <div key={l.label} className="labmap-label-pos" style={style}>
            <Item className={`labmap-label mono ${l.accent ? 'labmap-label--accent' : ''}`}>{l.label}</Item>
          </div>
        )
      })}
      </Stagger>

      <Stagger style={{ display: 'contents' }}>
        {hosts.map((h) => {
          const b = boxAt(h.corner)
          return (
            <Item
              key={h.id}
              className={`labmap-host box ${h.accent ? 'labmap-host--accent' : ''}`}
              style={{ left: b.x, top: b.y, width: BW, height: BH }}
            >
              <div className="labmap-host-name mono">{h.name}</div>
              {h.ip && <div className="labmap-host-ip mono">{h.ip}</div>}
              <div className="labmap-host-desc mono">{h.desc}</div>
            </Item>
          )
        })}
      </Stagger>
    </div>
  )
}
