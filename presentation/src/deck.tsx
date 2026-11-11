import { createContext, useContext } from 'react'
import { motion, Variants, HTMLMotionProps } from 'framer-motion'

/** What a slide sees: where it is in its fragment sequence and how to move. */
export interface DeckCtxValue {
  /** fragments revealed so far (0 = none) */
  fragment: number
  /** last navigation direction; backward reveals are instant */
  direction: 1 | -1
  /** prefers-reduced-motion, print, overview thumbnail: every animation is an instant state change */
  reduced: boolean
  print: boolean
}

export const DeckCtx = createContext<DeckCtxValue>({ fragment: 0, direction: 1, reduced: false, print: false })
export const useDeck = () => useContext(DeckCtx)

export const DUR = 0.4
export const EASE = 'easeOut' as const

/** Entrance variants shared by every staggered child. */
export const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DUR, ease: EASE } },
}

/**
 * Stagger container: children that are <Item> (or motion.* with variants={item})
 * enter 60 ms apart. With reduced motion they render in their final state.
 */
export function Stagger({ delay = 0, children, ...rest }: { delay?: number } & HTMLMotionProps<'div'>) {
  const { reduced } = useDeck()
  return (
    <motion.div
      initial={reduced ? false : 'hidden'}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

export function Item(props: HTMLMotionProps<'div'>) {
  return <motion.div variants={item} {...props} />
}

/**
 * A step reveal. Shown when the deck's fragment index reaches `index`.
 * Entrance animates; stepping backward hides it instantly. Layout is reserved
 * either way so nothing below it moves.
 */
export function Fragment({ index, children, style, ...rest }: { index: number } & HTMLMotionProps<'div'>) {
  const { fragment, direction, reduced } = useDeck()
  const shown = fragment >= index
  const instant = reduced || direction < 0 || !shown
  return (
    <motion.div
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={{ duration: instant ? 0 : DUR, ease: EASE }}
      style={{ visibility: shown ? 'visible' : 'hidden', ...(style ?? {}) }}
      aria-hidden={!shown}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Plain delayed entrance, for one-off elements outside a Stagger. */
export function Reveal({ delay = 0, children, ...rest }: { delay?: number } & HTMLMotionProps<'div'>) {
  const { reduced } = useDeck()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : DUR, ease: EASE, delay: reduced ? 0 : delay }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
