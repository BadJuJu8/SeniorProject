import { motion } from 'framer-motion'
import { Reveal, useDeck } from '../deck'
import { SlideDef, windowFromNotes } from './types'

const notes = `0:00 to 0:15. I’m Robert Garcia. My project is a way to test security alarms automatically. The one-sentence version: every time I change the code, a real attack runs against my lab, and the build only passes if the alarm goes off. This is the midpoint report: what I built, what I proved, and what is left.`

/* The headline is set in fixed lines so it can draw in line by line. */
const LINES = [
  <>Every code change launches</>,
  <>a real <em>attack</em> on my lab.</>,
  <>The build passes only if</>,
  <>the <em>alarm</em> goes off.</>,
]

function Cover() {
  const { reduced } = useDeck()
  const lineCount = LINES.length
  return (
    <div className="content cover">
      <Reveal className="eyebrow">CSUDH SENIOR PROJECT / MIDPOINT REPORT</Reveal>
      <h1 className="headline headline--display cover-headline" aria-label="Every code change launches a real attack on my lab. The build passes only if the alarm goes off.">
        {LINES.map((line, i) => (
          <span key={i} className="cover-line" aria-hidden>
            <motion.span
              className="cover-line-inner"
              initial={reduced ? false : { y: '110%' }}
              animate={{ y: '0%' }}
              transition={{ duration: reduced ? 0 : 0.48, ease: 'easeOut', delay: reduced ? 0 : 0.1 + i * 0.09 }}
            >
              {line}
            </motion.span>
          </span>
        ))}
      </h1>
      <Reveal delay={0.1 + lineCount * 0.09 + 0.2} className="body muted cover-sub">
        Automated testing for security alarms.
      </Reveal>
      <Reveal delay={0.1 + lineCount * 0.09 + 0.3} className="cover-name mono">
        Robert Garcia / October 2026
      </Reveal>
    </div>
  )
}

export const cover: SlideDef = {
  id: 'cover',
  section: 'open',
  fragments: 0,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Cover,
}
