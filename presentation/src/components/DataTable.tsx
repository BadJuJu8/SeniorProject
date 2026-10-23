import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { item, useDeck } from '../deck'
import './DataTable.css'

export interface Column {
  header: string
  /** grid track, e.g. '560px' or '1fr' */
  width: string
  mono?: boolean
}

/**
 * Rules, not boxes: a header row in 24px mono muted, then rows separated by
 * 1px lines. Rows fade in 60 ms apart after `delay` seconds.
 */
export function DataTable({
  columns,
  rows,
  size = 26,
  delay = 0,
  className = '',
}: {
  columns: Column[]
  rows: ReactNode[][]
  size?: number
  delay?: number
  className?: string
}) {
  const { reduced } = useDeck()
  const template = columns.map((c) => c.width).join(' ')
  return (
    <motion.div
      className={`table ${className}`}
      role="table"
      style={{ fontSize: size }}
      initial={reduced ? false : 'hidden'}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
    >
      {columns.some((c) => c.header) && (
        <div className="table-row table-head" role="row" style={{ gridTemplateColumns: template }}>
          {columns.map((c, i) => (
            <div key={i} className="table-cell mono" role="columnheader">
              {c.header}
            </div>
          ))}
        </div>
      )}
      {rows.map((r, i) => (
        <motion.div key={i} className="table-row" role="row" style={{ gridTemplateColumns: template }} variants={item}>
          {r.map((cell, j) => (
            <div key={j} className={`table-cell ${columns[j]?.mono ? 'mono' : ''}`} role="cell">
              {cell}
            </div>
          ))}
        </motion.div>
      ))}
    </motion.div>
  )
}
