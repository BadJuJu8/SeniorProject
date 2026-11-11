import { useEffect, useState } from 'react'
import { slides } from '../slides'
import { useDeckState } from '../hooks/useDeckState'
import { Stage } from './Stage'
import { SlideView } from './SlideView'
import { HelpOverlay } from './HelpOverlay'
import './Presenter.css'

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`

/**
 * /?presenter: current slide small, next slide smaller, notes large, an
 * elapsed timer since the first advance and the slide's time window. Stays
 * in sync with the main window over the BroadcastChannel; either can drive.
 */
export function Presenter() {
  const d = useDeckState('presenter')
  const s = slides[d.slide]
  const nextIndex = d.slide + 1 < slides.length ? d.slide + 1 : null

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  const elapsed = d.startedAt ? (now - d.startedAt) / 1000 : 0
  const over = s.timeWindow !== null && d.startedAt !== null && elapsed > s.timeWindow.end
  const windowText = s.timeWindow ? `${fmt(s.timeWindow.start)} to ${fmt(s.timeWindow.end)}` : 'no window'

  return (
    <div className="presenter">
      <div className="presenter-left">
        <div className="presenter-current">
          <div className="label presenter-caption">
            <span>NOW {pad(d.slide + 1)} / {pad(slides.length)} · {s.id}</span>
            <span>{s.fragments ? `fragment ${d.fragment} / ${s.fragments}` : 'no fragments'}</span>
          </div>
          <Stage fill={false} className="presenter-stage">
            <SlideView index={d.slide} fragment={d.fragment} direction={d.direction} />
          </Stage>
        </div>
        <div className="presenter-row">
          <div className="presenter-next">
            <div className="label presenter-caption">
              <span>{nextIndex === null ? 'END OF DECK' : `NEXT ${pad(nextIndex + 1)} / ${pad(slides.length)} · ${slides[nextIndex].id}`}</span>
            </div>
            {nextIndex !== null ? (
              <Stage fill={false} className="presenter-stage">
                <SlideView index={nextIndex} fragment={slides[nextIndex].fragments} reduced />
              </Stage>
            ) : (
              <div className="presenter-end box" />
            )}
          </div>
          <div className="presenter-timer">
            <div className="label">ELAPSED</div>
            <div className={`presenter-clock mono ${over ? 'presenter-clock--over' : ''}`} data-over={over}>
              {d.startedAt ? fmt(elapsed) : '0:00'}
            </div>
            <div className={`presenter-status mono ${over ? 'accent' : 'muted'}`}>
              {d.startedAt ? (over ? `OVER the window by ${fmt(elapsed - (s.timeWindow?.end ?? 0))}` : 'ON TIME') : 'starts on first advance'}
            </div>
            <div className="label presenter-window-label">THIS SLIDE</div>
            <div className="presenter-window mono">{windowText}</div>
          </div>
        </div>
      </div>
      <div className="presenter-notes">
        <div className="label">NOTES</div>
        <p className="presenter-notes-text">{s.notes}</p>
      </div>
      {d.help && <HelpOverlay onClose={() => d.setHelp(false)} />}
    </div>
  )
}
