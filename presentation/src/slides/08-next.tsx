import { Fragment, Item, Stagger } from '../deck'
import { SlideDef, windowFromNotes } from './types'

const notes = `4:15 to 5:00. Scope stops at one attack, proven end to end. Three more attacks are parked for later. [advance through the list] Remaining work: build the safe-test step, run the runners as services, protect the main branch, update the write-up, and the final report in December. The main limit: the rule catches one style of this attack; the production answer is to spot unusual volume instead. [advance] Every change fires a real attack. The build passes only if the alarm catches it. Questions.`

const work = [
  'Build the safe-test step',
  'Run the runners as services',
  'Protect the main branch',
  'Update the write-up',
  'Final report, December',
]

function Next() {
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">SCOPE AND THE ROAD TO DECEMBER</Item>
        <Item>
          <h1 className="headline">One attack, <em>done properly</em></h1>
        </Item>
        <div className="next-cols">
          <div className="next-left">
            <Item className="next-scope">
              Three more attacks are parked for later.
            </Item>
            <Item className="box next-limits">
              <div className="label">KNOWN LIMITS</div>
              <p className="next-limits-text">
                Catches one style of attack. Next step: spot unusual volume instead.
              </p>
            </Item>
          </div>
          <div className="next-right">
            <Item className="label">REMAINING WORK, IN ORDER</Item>
            <ol className="next-list mono">
              {work.map((w, i) => (
                <Fragment key={w} index={i + 1} className="next-item">
                  <li>
                    <span className="next-num muted">{String(i + 1).padStart(2, '0')}</span>
                    <span>{w}</span>
                  </li>
                </Fragment>
              ))}
            </ol>
            <Fragment index={6} className="next-close">
              Every change fires a real <em>attack</em>. The build passes only if the <em>alarm</em> catches it.
            </Fragment>
          </div>
        </div>
      </Stagger>
    </div>
  )
}

export const next: SlideDef = {
  id: 'next',
  section: 'found',
  fragments: 6,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Next,
}
