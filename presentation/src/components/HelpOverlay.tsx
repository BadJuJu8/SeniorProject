import './HelpOverlay.css'

export const KEYS: [string, string][] = [
  ['Right, Space, PageDown, N', 'next (advances a fragment first)'],
  ['Left, PageUp, P', 'previous'],
  ['Home / End', 'first / last slide'],
  ['digits, then Enter', 'jump to that slide number'],
  ['F', 'toggle fullscreen'],
  ['B', 'black screen'],
  ['S', 'open the presenter window'],
  ['Esc', 'overview grid; click a slide to jump'],
  ['?', 'this help'],
  ['click right / left half', 'next / previous'],
]

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="help" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="help-panel box" onClick={(e) => e.stopPropagation()}>
        <div className="label">KEYBOARD</div>
        <dl className="help-list">
          {KEYS.map(([k, v]) => (
            <div key={k} className="help-row">
              <dt className="mono">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="label help-foot">URL hash #/slide/fragment holds the position. ?presenter and ?print are the other views.</div>
      </div>
    </div>
  )
}
