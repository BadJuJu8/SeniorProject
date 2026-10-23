import { useReducedMotion } from 'framer-motion'
import { DeckCtx } from '../deck'
import { slides } from '../slides'
import { Chrome } from './Chrome'

/**
 * One slide rendered into a 1920 x 1080 root: background grid, chrome and
 * the slide component, with the fragment / motion context it reads.
 */
export function SlideView({
  index,
  fragment,
  direction = 1,
  reduced = false,
  print = false,
}: {
  index: number
  fragment: number
  direction?: 1 | -1
  reduced?: boolean
  print?: boolean
}) {
  const userReduced = useReducedMotion() ?? false
  const s = slides[index]
  const Component = s.Component
  return (
    <DeckCtx.Provider value={{ fragment, direction, reduced: reduced || userReduced || print, print }}>
      <section className="slide-root" data-slide={s.id} aria-label={`Slide ${index + 1}`}>
        <Chrome section={s.section} index={index} total={slides.length} />
        <Component />
      </section>
    </DeckCtx.Provider>
  )
}
