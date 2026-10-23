import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { slides } from './slides'
import { useDeckState } from './hooks/useDeckState'
import { Stage } from './components/Stage'
import { SlideView } from './components/SlideView'
import { Overview } from './components/Overview'
import { HelpOverlay } from './components/HelpOverlay'
import { Presenter } from './components/Presenter'
import { PrintView } from './components/PrintView'

function Deck() {
  const d = useDeckState('main')
  const reduced = useReducedMotion() ?? false
  const s = slides[d.slide]

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (d.overview || d.help) return
    if (e.clientX >= window.innerWidth / 2) d.next()
    else d.prev()
  }

  return (
    <Stage onClick={onClick}>
      <AnimatePresence initial={false}>
        <motion.div
          key={s.id}
          className="slide-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: 'linear' }}
        >
          <SlideView index={d.slide} fragment={d.fragment} direction={d.direction} />
        </motion.div>
      </AnimatePresence>
      {d.overview && (
        <Overview
          current={d.slide}
          onPick={(i) => {
            d.goTo(i, 0)
            d.setOverview(false)
          }}
        />
      )}
      {d.help && <HelpOverlay onClose={() => d.setHelp(false)} />}
      {d.black && <div className="black-screen" aria-label="Black screen" />}
      {d.buffer && (
        <div className="jump-buffer" aria-live="polite">
          go to <b>{d.buffer}</b>, Enter
        </div>
      )}
    </Stage>
  )
}

export default function App() {
  const q = new URLSearchParams(location.search)
  if (q.has('print')) return <PrintView />
  if (q.has('presenter')) return <Presenter />
  return <Deck />
}
