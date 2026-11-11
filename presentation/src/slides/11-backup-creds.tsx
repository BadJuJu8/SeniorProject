import { Item, Stagger } from '../deck'
import { DataTable } from '../components/DataTable'
import { SlideDef, windowFromNotes } from './types'

const notes = `For "how does the pipeline get root on the SIEM" or "isn’t a passphrase-less key dangerous." The playbook itself: copy with backup, wazuh-analysisd -t, rescue restores the backup and fails without restarting, restart only if the file changed, wazuh-control status must show analysisd running.`

const rows = [
  ['ci_deploy_ed25519, no passphrase', 'netAdmin only, mode 600, never in git', 'authorized_keys on the manager carries from="10.60.0.100", so the key is useless from any other host'],
  ['ansible_ed25519, with passphrase', 'netAdmin', 'manual runs only; CI cannot type a passphrase (BatchMode skips it)'],
  ['sudo password (ansible_become_password)', 'group_vars vault.yml, committed as AES256 ciphertext', 'decrypted only with ~/.ansible_vault_pass on netAdmin, mode 600, never in git'],
  ['inventory (real IP, SSH user)', 'Gitea secret ANSIBLE_INVENTORY', 'written to disk for the job, deleted in an if: always() step'],
  ['Wazuh API and indexer passwords', 'Gitea secrets', 'read from the environment by ci/config.py; nothing sensitive in the repo'],
]

function BackupCreds() {
  return (
    <div className="content">
      <Stagger>
        <Item className="eyebrow">BACKUP / DEPLOYMENT</Item>
        <Item>
          <h1 className="headline">How CI authenticates without a human</h1>
        </Item>
        <Item className="body-sm creds-body">
          CI has no keyboard, so every secret it uses is unattended, and every unattended secret is scoped to one host, one
          user, one purpose.
        </Item>
      </Stagger>
      <DataTable
        delay={0.3}
        columns={[
          { header: 'Credential', width: '520px', mono: true },
          { header: 'Where it lives', width: '440px' },
          { header: 'How it is scoped', width: '1fr' },
        ]}
        rows={rows}
      />
      <Stagger delay={0.8}>
        <Item className="footnote">
          Why Vault instead of a NOPASSWD sudo rule: Ansible become runs sudo /bin/sh -c "python3 /tmp/module", so a narrow
          rule would have to allow a shell and Python, which is full root anyway. The real choice was whether root still
          needs a secret. It does.
        </Item>
      </Stagger>
    </div>
  )
}

export const backupCreds: SlideDef = {
  id: 'backup-creds',
  section: 'backup',
  fragments: 0,
  notes,
  timeWindow: windowFromNotes(notes),
  Component: BackupCreds,
}
