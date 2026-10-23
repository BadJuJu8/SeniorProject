import { slides } from '../slides'
import { SlideView } from './SlideView'
import './Overview.css'

const SCALE = 0.16
const pad = (n: number) => String(n).padStart(2, '0')

/** Esc grid: every slide, all fragments shown, no animation. Click one to jump. */
export function Overview({ current, onPick }: { current: number; onPick: (i: number) => void }) {
  return (
    <div className="overview" onClick={(e) => e.stopPropagation()}>
      <div className="overview-grid">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`overview-cell ${i === current ? 'overview-cell--current' : ''}`}
            onClick={() => onPick(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === current ? 'true' : undefined}
          >
            <div className="overview-thumb">
              <div className="overview-scaled" style={{ transform: `scale(${SCALE})` }}>
                <SlideView index={i} fragment={s.fragments} reduced print />
              </div>
            </div>
            <div className="overview-caption mono">
              <span>{pad(i + 1)} / {pad(slides.length)}</span>
              <span>{s.section}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
