import { Item, Stagger } from '../deck'
import { DataTable } from '../components/DataTable'
import { SlideDef, windowFromNotes } from './types'

const notes = `For "what are the weaknesses." Lead with the first three rows; they are detection limits. The rest are engineering debt.`

const rows = [
  ['AES tickets are not detected (Rubeus can request AES; slower to crack, still viable)', 'RC4 in an AES domain is the strongest single-event signal', 'frequency rule: N distinct SPNs by one user in a short window, any cipher'],
  ['Single-event rule is noisy where legacy RC4 services exist', 'the lab is quiet because svc_sql is the only RC4 account, by design', 'baseline and allow-list RC4 accounts; migrate them to AES'],
  ['Machine-account blind spot: a SYSTEM-shell roast or an account named like backup$ is filtered out', 'the exclusions are what make the rule usable on a busy DC', 'the same volume rule, which needs no name-based exclusion'],
  ['detect proves the deployed rule, not the commit’s', 'pipeline was built detect-then-deploy so an unproven rule never reaches the manager', 'shadow candidate under id 110201 (slide 7)'],
  ['Sigma and XML can drift', 'no reliable Sigma to Wazuh converter; both are hand-authored', 'negative sample suite applied to both'],
  ['validate needs the internet (checkout from GitHub, packages from PyPI)', 'host-mode runner fetches the action every run', 'mirror actions/checkout into Gitea; cache packages'],
  ['Windows runner is a console process under my account', 'LocalSystem would roast as the machine account, which the rule ignores', 'service under a dedicated low-privilege domain user'],
]

function BackupLimits() {
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">BACKUP / LIMITATIONS</Item>
        <Item>
          <h1 className="headline">What this does not catch, and what would</h1>
        </Item>
      </Stagger>
      <DataTable
        delay={0.2}
        columns={[
          { header: 'Limitation', width: '600px' },
          { header: 'Why it exists', width: '500px' },
          { header: 'Next step', width: '1fr' },
        ]}
        rows={rows}
      />
    </div>
  )
}

export const backupLimits: SlideDef = {
  id: 'backup-limits',
  section: 'backup',
  fragments: 0,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: BackupLimits,
}
