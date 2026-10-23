import { motion } from 'framer-motion'
import { useDeck } from '../deck'
import './RollingNumber.css'

const STRIP = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const CH = 0.6 // JetBrains Mono advance width in em

/**
 * A mono number that rolls from one value to another digit by digit.
 * `digits` fixes the column count so a value that gains a digit grows a
 * column on the left instead of reflowing.
 */
export function RollingNumber({
  value,
  digits,
  className = '',
}: {
  value: number
  digits: number
  className?: string
}) {
  const { reduced, direction } = useDeck()
  const instant = reduced || direction < 0
  const str = String(value).padStart(digits, ' ')
  const cols = str.split('').map((c) => (c === ' ' ? 0 : 1 + parseInt(c, 10)))

  return (
    <span className={`roll mono ${className}`} aria-label={String(value)}>
      {cols.map((idx, i) => (
        <motion.span
          key={i}
          className="roll-col"
          initial={false}
          animate={{ width: idx === 0 ? '0em' : `${CH}em` }}
          transition={{ duration: instant ? 0 : 0.5, ease: 'easeOut' }}
        >
          <motion.span
            className="roll-strip"
            initial={false}
            animate={{ y: `${-idx}em` }}
            transition={{ duration: instant ? 0 : 0.7, ease: 'easeOut', delay: instant ? 0 : i * 0.06 }}
          >
            {STRIP.map((d, j) => (
              <span key={j} className="roll-cell">
                {d || ' '}
              </span>
            ))}
          </motion.span>
        </motion.span>
      ))}
    </span>
  )
}
