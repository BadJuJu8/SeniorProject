import { ReactNode, useLayoutEffect, useRef, useState } from 'react'

const W = 1920
const H = 1080

/**
 * A fixed 1920 x 1080 frame scaled with a CSS transform to fit its container,
 * letterboxed. Layout inside never reflows.
 *
 * `fill` (default) fills the viewport. Otherwise it fills the parent's width
 * and reports a matching height, for presenter and overview thumbnails.
 */
export function Stage({
  children,
  fill = true,
  className = '',
  onClick,
}: {
  children: ReactNode
  fill?: boolean
  className?: string
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ scale: 1, x: 0, y: 0, h: H })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = fill ? window.innerWidth : el.clientWidth
      const h = fill ? window.innerHeight : (w * H) / W
      const scale = Math.min(w / W, h / H)
      setT({ scale, x: (w - W * scale) / 2, y: (h - H * scale) / 2, h })
    }
    measure()
    if (fill) {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill])

  return (
    <div
      ref={ref}
      className={`${fill ? 'stage-viewport' : 'stage-thumb'} ${className}`}
      style={fill ? undefined : { position: 'relative', width: '100%', height: t.h, overflow: 'hidden' }}
      onClick={onClick}
    >
      <div className="stage" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})` }}>
        {children}
      </div>
    </div>
  )
}
