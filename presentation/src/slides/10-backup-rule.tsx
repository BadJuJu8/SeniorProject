import { Item, Stagger } from '../deck'
import { DataTable } from '../components/DataTable'
import { SlideDef, windowFromNotes } from './types'

const notes = `For "show me the rule." Walk the three positive matches first, then the three exclusions, then the pcre2 story if asked why the exclusions look the way they do.`

const rows = [
  ['if_group windows_security', 'only Windows Security events the base rules tagged', 'chains onto the base ruleset so it can beat rule 60106'],
  ['eventID ^4769$', 'a service ticket was requested', 'the one catchable moment; anchored so 47690 cannot match'],
  ['ticketEncryptionType ^0x17$', 'RC4-HMAC', 'crackable cipher; modern traffic is AES'],
  ['status ^0x0$', 'the request succeeded', 'a failed request gives the attacker nothing'],
  ['serviceName not ending in $ (pcre2, negate)', 'skip machine-account services', '120-character rotating passwords; constant normal noise'],
  ['serviceName not krbtgt (negate)', 'skip the TGT account', 'not a roast target'],
  ['targetUserName not containing $@ (negate)', 'skip machine-account requesters', 'machines request tickets constantly'],
]

function BackupRule() {
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">BACKUP / THE DETECTION</Item>
        <Item>
          <h1 className="headline">Rule 100201, line by line</h1>
        </Item>
      </Stagger>
      <DataTable
        delay={0.2}
        columns={[
          { header: 'Line in local_rules.xml', width: '560px', mono: true },
          { header: 'Meaning', width: '480px' },
          { header: 'Why', width: '1fr' },
        ]}
        rows={rows}
      />
      <Stagger delay={0.8}>
        <Item className="footnote">
          Level 12, MITRE T1558.003. Exclusions need type="pcre2": a literal $ is unreliable in Wazuh’s default OS_Regex, and
          a negated field that never matches is always true, so the filter silently did nothing until that was fixed. The
          Sigma twin is rules/sigma/kerberoasting.yml; the offline tests check both against the same sample.
        </Item>
      </Stagger>
    </div>
  )
}

export const backupRule: SlideDef = {
  id: 'backup-rule',
  section: 'backup',
  fragments: 0,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: BackupRule,
}
