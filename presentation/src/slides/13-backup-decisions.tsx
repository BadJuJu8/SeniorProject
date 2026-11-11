import { Item, Stagger } from '../deck'
import { DataTable } from '../components/DataTable'
import { SlideDef, windowFromNotes } from './types'

const notes = `For "why did you choose X." Each row is one sentence; do not read the table.`

const rows = [
  ['Atomic Red Team, not Caldera', 'Caldera wants about 16 GB of RAM, the whole host; ART runs one test at a time, and test 5 is pure PowerShell that runs with Defender on'],
  ['Self-hosted Gitea and runners, GitHub as a mirror', 'the runners have to sit inside the isolated lab to reach the DC and the SIEM; GitHub-hosted runners cannot'],
  ['Two runners by label', 'the attack needs a domain-joined Windows machine; lint and Ansible are Linux work'],
  ['Replaced the logtest unit test with a rule-loaded pre-flight', 'logtest cannot decode agent-style Windows events, so that test could never fail; a test that cannot fail is worthless'],
  ['Passphrase-less CI key restricted by from=, plus vaulted sudo', 'unattended automation without leaving a credential usable anywhere else'],
  ['Firewall kept closed; the post-deploy check moved to the workstation', 'least privilege toward the SIEM: use a host that is already allowed rather than open another path'],
  ['Server Core DC, capped indexer heap, Gitea in an LXC', 'fits the whole lab in 16 GB'],
  ['Scope cut to Kerberoasting on 2026-10-05', 'the repo should match what is built; the manifest keeps the parked techniques additive'],
]

function BackupDecisions() {
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">BACKUP / DESIGN DECISIONS</Item>
        <Item>
          <h1 className="headline">Decisions I would defend</h1>
        </Item>
      </Stagger>
      <DataTable
        delay={0.2}
        columns={[
          { header: 'Decision', width: '600px' },
          { header: 'Why', width: '1fr' },
        ]}
        rows={rows}
      />
    </div>
  )
}

export const backupDecisions: SlideDef = {
  id: 'backup-decisions',
  section: 'backup',
  fragments: 0,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: BackupDecisions,
}
