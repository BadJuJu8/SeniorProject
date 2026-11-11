import { useEffect } from 'react'
import { slides } from '../slides'
import { SlideView } from './SlideView'
import './PrintView.css'

/** /?print: every slide stacked at exactly 1920 x 1080, all fragments, no animation. */
export function PrintView() {
  useEffect(() => {
    document.documentElement.classList.add('print-mode')
    return () => document.documentElement.classList.remove('print-mode')
  }, [])
  return (
    <div className="print">
      {slides.map((s, i) => (
        <div key={s.id} className="print-page" data-page={i + 1}>
          <SlideView index={i} fragment={s.fragments} reduced print />
        </div>
      ))}
    </div>
  )
}
