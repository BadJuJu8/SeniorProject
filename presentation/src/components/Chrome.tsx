const pad = (n: number) => String(n).padStart(2, '0')

/** Top rule at y = 96: section name left, `03 / 12` counter right. */
export function Chrome({ section, index, total }: { section: string; index: number; total: number }) {
  return (
    <div className="chrome" aria-hidden>
      <span className="chrome-section">{section}</span>
      <span className="chrome-counter">
        {pad(index + 1)} / {pad(total)}
      </span>
    </div>
  )
}
