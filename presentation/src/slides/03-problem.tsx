import { Fragment, Item, Stagger, useDeck } from '../deck'
import { RollingNumber } from '../components/RollingNumber'
import { SlideDef, windowFromNotes } from './types'

const notes = `0:45 to 1:25. The attack is called Kerberoasting. In a Windows network, one central computer hands out access tickets, and any user is allowed to ask it for one. The trouble is you can take that ticket away and crack the password on your own machine, offline, where no alarm is watching. So the only moment anyone can catch you is the instant you ask. When I ran this by hand in August, my alarm looked at that moment and called it a normal login, low severity. [advance] Same log entry. After I wrote a rule, it is now a high-severity Kerberoasting alert. Nothing about the attack changed. The only difference is the rule. [advance] And that is the whole project. Most teams only check that a rule is written correctly. Mine fires the real attack and fails the build if the alarm stays quiet.`

function Problem() {
  const { fragment } = useDeck()
  const rolled = fragment >= 1
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">THE PROBLEM</Item>
        <Item>
          <h1 className="headline">
            The alarm saw the attack and called it <em>a login</em>
          </h1>
        </Item>
        <div className="problem-cols">
          <div className="problem-left">
            <Item className="label">KERBEROASTING, IN 3 STEPS</Item>
            <div className="problem-steps">
              {[
                'Any user asks for a service ticket.',
                'They take it away and crack the password.',
                'The only clue is one log entry.',
              ].map((t, i) => (
                <Item key={t} className="problem-step">
                  <span className="problem-step-num mono">{String(i + 1).padStart(2, '0')}</span>
                  <span>{t}</span>
                </Item>
              ))}
            </div>
            <Item className="problem-define">
              <span className="mono">SIEM</span> = the network’s alarm system
            </Item>
          </div>
          <Item className="problem-stat">
            <div className="label problem-kicker">WHAT THE ALARM SAID</div>
            <RollingNumber value={rolled ? 100201 : 60106} digits={6} className="problem-number" />
            <div className={`label problem-label ${rolled ? 'problem-label--struck' : ''}`}>Login, low severity</div>
            <Fragment index={1} className="label problem-label problem-label--new">
              Kerberoasting, high severity
            </Fragment>
            <div className="problem-sub">
              <div className="label" style={{ visibility: rolled ? 'hidden' : 'visible' }}>
                a real attack, labeled harmless
              </div>
              <Fragment index={1} className="label">
                same event, different rule
              </Fragment>
            </div>
          </Item>
        </div>
      </Stagger>
      <Fragment index={2} className="bottom-line">
        Most projects check that rules look right. Mine checks that they fire.
      </Fragment>
    </div>
  )
}

export const problem: SlideDef = {
  id: 'problem',
  section: 'open',
  fragments: 2,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Problem,
}
