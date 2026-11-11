import { Fragment, Item, Stagger } from '../deck'
import { LabMap } from '../components/LabMap'
import { PipelineStrip } from '../components/PipelineStrip'
import { SlideDef, windowFromNotes } from './types'

const notes = `1:25 to 2:05. Four computers. The workstation launches the attack, the domain controller is the target, Wazuh is the alarm, and netAdmin runs the tests. [advance] Every code change runs four automatic checks. Validate checks the rule for mistakes. Detect fires the attack and waits for the alarm. Deploy ships the rule to the alarm system. Verify-deploy confirms it loaded. Names, addresses and ports are on the backup slides.`

const hosts = [
  { id: 'netadmin', name: 'netAdmin', desc: 'runs the tests', corner: 'tl' as const },
  { id: 'wazuh', name: 'Wazuh', desc: 'the alarm', corner: 'tr' as const },
  { id: 'ws', name: 'IT-RGARCIA', desc: 'launches the attack', corner: 'bl' as const, accent: true },
  { id: 'dc', name: 'DC01', desc: 'the target', corner: 'br' as const },
]

const connectors = [
  { from: 'netadmin', to: 'wazuh', label: 'deploys rules' },
  { from: 'ws', to: 'dc', label: 'ticket request' },
  { from: 'ws', to: 'netadmin', label: 'gets jobs' },
  { from: 'dc', to: 'wazuh', label: 'sends logs' },
  { from: 'ws', to: 'wazuh', label: 'checks the alarm', accent: true },
]

const travel: [string, string][] = [
  ['ws', 'dc'],
  ['dc', 'wazuh'],
  ['ws', 'wazuh'],
]

function Built() {
  return (
    <div className="content built">
      <Stagger>
        <Item className="eyebrow">WHAT I BUILT</Item>
        <Item>
          <h1 className="headline">Four computers, four automatic checks</h1>
        </Item>
      </Stagger>
      <LabMap hosts={hosts} connectors={connectors} travel={travel} />
      <Fragment index={1} className="built-pipeline">
        <PipelineStrip
          run
          nodes={[{ label: 'validate' }, { label: 'detect', accent: true }, { label: 'deploy' }, { label: 'verify-deploy' }]}
        />
        <div className="label built-jobs">
          check it / attack it / ship it / confirm it
        </div>
      </Fragment>
    </div>
  )
}

export const built: SlideDef = {
  id: 'built',
  section: 'built',
  fragments: 1,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: Built,
}
