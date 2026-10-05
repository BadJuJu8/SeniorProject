# Runbook — standing up the pipeline

Concrete, copy-pasteable steps that turn the plan in [`PLAN.md`](PLAN.md) into a running
system. Phases match the plan's phase order; each ends with something verifiable. Fill the
real network values into `secrets/network.md` (gitignored) before Phase 1.

> **Scope / ethics.** Everything here runs inside the isolated lab VLAN on hardware you
> own. The "attacks" are Atomic Red Team test cases fired at your own machines to prove
> detections fire. Do not point any of this at systems you do not control.

---

## 0. Developer workstation (no lab required)

The offline suite runs anywhere and gates every commit before the lab is even touched.

```bash
python -m venv .venv
. .venv/bin/activate            # Windows: .venv\Scripts\Activate.ps1
pip install -r ci/requirements.txt
pytest ci/test_offline.py -v    # rules match samples; reductions hold; XML/YAML valid
bash heatmap/gen_layer.sh       # writes heatmap/navigator_layer.json (gitignored)
```

---

## 1. Network (Phase 1)

Do this first and verify it before layering AD on top — the plan calls Phase 1 the
historically painful part.

1. Create the lab VLAN on OPNsense (802.1Q tag from `secrets/network.md`), assign the
   interface, enable it.
2. **Outbound NAT must cover the new subnet** — Firewall ▸ NAT ▸ Outbound. This is the
   #1 past failure; confirm the rule lists the lab CIDR.
3. Static IPs / DHCP reservations (no plain DHCP — avoids the /32 drift that broke rules
   before).
4. From a lab host: `ping <gateway>` and `ping 1.1.1.1` (if outbound is intended) to
   confirm reachability and NAT.

**Done when:** a lab host can reach its gateway and (if allowed) the internet, with static
addressing.

---

## 2. Wazuh all-in-one (Phase 2)

```bash
curl -sO https://packages.wazuh.com/4.14/wazuh-install.sh
sudo bash ./wazuh-install.sh -a          # all-in-one
```

Cap the indexer heap for a 16 GB host (the biggest RAM lever):

```bash
sudo sed -i 's/^-Xms.*/-Xms2g/; s/^-Xmx.*/-Xmx2g/' /etc/wazuh-indexer/jvm.options
sudo systemctl restart wazuh-indexer
# Stop the dashboard unless you're actively investigating (~200 MB):
sudo systemctl disable --now wazuh-dashboard
```

Verify both APIs answer (fill creds from `secrets/network.md`):

```bash
# manager API -> JWT
curl -sku wazuh-wui:PASS -X POST 'https://<wazuh>:55000/security/user/authenticate' | jq .data.token
# indexer API -> cluster up
curl -sku admin:PASS 'https://<wazuh>:9200/_cluster/health?pretty'
```

**Done when:** manager auth returns a token and `python ci/logtest_unit.py` matches a
hand-fed 4769 (see Phase 5).

---

## 3. AD lab (Phase 3)

- **DC — Windows Server Core** (saves ~1.5–2 GB vs Desktop Experience):

  ```powershell
  Install-WindowsFeature AD-Domain-Services -IncludeManagementTools
  Install-ADDSForest -DomainName robslab.local -InstallDns
  ```

- **Seed the deliberately weak configs** (documented so hardening has something to reverse):

  ```powershell
  # Kerberoastable SPN account with a weak password + RC4 allowed
  New-ADUser svc_sql -SamAccountName svc_sql -ServicePrincipalNames 'MSSQLSvc/sql.robslab.local:1433' `
    -AccountPassword (ConvertTo-SecureString 'Summer2026!' -AsPlainText -Force) -Enabled $true
  # AS-REP roastable user (pre-auth disabled)
  New-ADUser svc_legacy -SamAccountName svc_legacy -DoesNotRequirePreAuth $true `
    -AccountPassword (ConvertTo-SecureString 'Password123' -AsPlainText -Force) -Enabled $true
  # Over-permissioned DCSync foothold: grant replication rights to a low-priv account (lab only!)
  ```

- **Sysmon** (SwiftOnSecurity base config) + **Wazuh agent** on the DC and the workstation.
- **Audit policy** so the events actually emit (see traceability.md):

  ```powershell
  auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable
  auditpol /set /subcategory:"Kerberos Authentication Service" /success:enable
  auditpol /set /subcategory:"Directory Service Access" /success:enable
  # + set a SACL for "Replicating Directory Changes" on the domain naming context (DCSync)
  ```

**Done when:** both agents show green in Wazuh and the DC emits 4769/4768/4662.

---

## 4. Gitea + runner + mirror (Phase 4)

- Stand up Gitea in its LXC; create the `SeniorProject` repo; add
  `https://github.com/BadJuJu8/SeniorProject.git` as a push mirror (Settings ▸ Repository
  ▸ Mirror).
- Register **two** Act runners (host mode, no Docker):
  - on the Gitea LXC with label **`linux`** (python, ansible, S2AN);
  - **on the Windows target** with label **`windows`** (fires atomics locally — no remoting).
- Configure repo Secrets/Variables the pipeline reads (see the header of
  [`.gitea/workflows/detect.yml`](../.gitea/workflows/detect.yml)):
  - Variables: `WAZUH_MANAGER_URL`, `WAZUH_API_USER`, `WAZUH_INDEXER_URL`, `WAZUH_INDEXER_USER`
  - Secrets: `WAZUH_API_PASSWORD`, `WAZUH_INDEXER_PASSWORD`, `ANSIBLE_INVENTORY`, `ANSIBLE_VAULT_PASS`

**Done when:** a hello commit runs a job on the Windows box.

---

## 5. First rule end-to-end, by hand (Phase 5)

Prove the Wazuh side before wrapping it in CI.

```powershell
# On the Windows target: install the atomic driver once
Install-Module -Name Invoke-AtomicRedTeam -Scope CurrentUser -Force
```

```bash
# 1. Deploy the rule (or copy local_rules.xml by hand for the very first run)
ansible-playbook -i ansible/inventory.ini ansible/deploy-rule.yml

# 2. Unit test — no attack, lab can be down
python ci/logtest_unit.py --technique kerberoasting     # expect rule.id 100201
```

```powershell
# 3. Fire the real attack from the Windows target and capture the start time
pwsh ci/fire_atomic.ps1 -Technique kerberoasting -GetPrereqs -StartTimeFile start.txt
# 4. Integration test — confirm the alert landed
python ci/confirm_alert.py --technique kerberoasting --since (Get-Content start.txt) --timeout 240
```

**Done when:** unit test matches `100201` and the integration test finds a `T1558.003` alert.

---

## 6. Wrap it in CI (Phase 6)

Push a change under `rules/**` and watch `detection-as-code` go green:
`validate` → `detect` (unit → fire → confirm) → `deploy` → `heatmap`. The build fails if
the detection does not actually fire. Kerberoasting must stay green before adding techniques.

## 7. Add techniques one at a time (Phase 7)

DCSync → AS-REP → Pass-the-Hash. AS-REP and PtH need Defender off, so run them against the
Defender-off snapshot and revert after. Add each technique's row to
[`tests/samples/manifest.json`](../tests/samples/manifest.json); the offline suite,
`logtest_unit.py`, `confirm_alert.py`, and the heatmap all pick it up automatically.

## 8–9. Heatmap + write-ups + SigmaHQ PR

- `bash heatmap/gen_layer.sh` → open `navigator_layer.json` in the ATT&CK Navigator.
- One write-up per technique in `writeups/` (template provided).
- Run `sigma check rules/sigma/` clean, then open the most generally-useful rule as a PR
  to SigmaHQ for a verifiable open-source detection-engineering credit.
