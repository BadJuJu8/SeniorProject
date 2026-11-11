import { Item, Stagger } from '../deck'
import { SlideDef, windowFromNotes } from './types'

const notes = `Stop here. Jump to whichever backup slide a question calls for: 10 rule, 11 credentials, 12 limitations, 13 decisions.`

function Backup() {
  return (
    <div className="content">
      <Stagger className="backup-block">
        <Item className="eyebrow">NOT PART OF THE FIVE MINUTES</Item>
        <Item>
          <h1 className="headline headline--display">Backup</h1>
        </Item>
        <Item className="body muted">The rule line by line / how CI authenticates / limitations / design decisions</Item>
      </Stagger>
    </div>
  )
}

export const backup: SlideDef = {
  id: 'backup',
  section: 'backup',
  fragments: 0,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Backup,
}
