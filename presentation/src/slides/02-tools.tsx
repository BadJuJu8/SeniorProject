import { Fragment, Item, Stagger } from '../deck'
import { SlideDef, windowFromNotes } from './types'

const notes = `0:15 to 0:45. To test an alarm you need something to protect, so I built a tiny company network. [advance] Active Directory is where the user accounts live; most businesses run it. [advance] The SIEM, Wazuh, is the alarm system. It reads the computers’ logs and raises alerts. [advance] Atomic Red Team is a library of safe, scripted attacks, a fire drill for security tools. [advance] And the CI/CD pipeline is a robot that runs every check whenever the code changes. [advance] Put together: change the code, and the attack runs by itself.`

const parts = [
  { name: 'Active Directory', desc: 'The company’s user accounts and logins.' },
  { name: 'SIEM (Wazuh)', desc: 'The alarm system that reads the logs.' },
  { name: 'Atomic Red Team', desc: 'Safe, scripted attacks, like a fire drill.' },
  { name: 'CI/CD pipeline', desc: 'A robot that runs every check when the code changes.' },
]

function Tools() {
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">WHAT I USED</Item>
        <Item>
          <h1 className="headline">
            A small company network, <em>built in a lab</em>
          </h1>
        </Item>
        <Item className="body muted tools-sub">The same pieces a real business uses, at a very small scale.</Item>
      </Stagger>
      <div className="tools-list">
        {parts.map((p, i) => (
          <Fragment key={p.name} index={i + 1} className="tools-row">
            <span className="tools-num mono">{String(i + 1).padStart(2, '0')}</span>
            <span className="tools-name mono">{p.name}</span>
            <span className="tools-desc">{p.desc}</span>
          </Fragment>
        ))}
      </div>
      <Fragment index={5} className="bottom-line">
        Change the code, and the attack runs by itself.
      </Fragment>
    </div>
  )
}

export const tools: SlideDef = {
  id: 'tools',
  section: 'open',
  fragments: 5,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Tools,
}
