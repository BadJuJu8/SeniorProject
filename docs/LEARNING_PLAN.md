# Learning plan — build this so you can *defend* it

A semester-length, learning-first path through this project. The point is not to *have*
a working pipeline — it's to understand every piece well enough to defend it in an
interview. Ordered start → end. Tick the boxes as you go.

> **Guiding rule:** attack → capture the real event → write the rule yourself → diff
> against the generated version in `reference/` → explain every line. A phase isn't done
> when it works; it's done when you can explain it out loud.

**Profile this plan assumes:** Proxmox host ready · ~one semester · graded on a
report + presentation, but the real goal is a portfolio piece you can defend · strong on
virtualization + Windows AD/PowerShell · growing into VLANs/NAT, Linux, and — the big two
— Python/CI/Ansible and detection concepts (Kerberos, Sigma, Wazuh).

**Two habits that run the whole way through**
- Keep a **dated lab journal** — what broke, what you tried, what you learned. It's the
  report's raw material and your best interview stories.
- End every session with *a working detection, a written-up finding, or something new you
  can explain — or it didn't count.* Don't rabbit-hole in infra; plumbing serves detections.

---

## Phase 0 — Save the work + get the vocabulary (Week 1) — *no lab needed*
- [ ] Commit the current state and push to GitHub (this repo is your answer key, frozen).
- [ ] Create a `reference/` folder; you'll move generated rules there before rewriting them.
- [ ] Learn the vocabulary: Wazuh **agent → manager/analysisd → indexer**; Sigma vs. Wazuh
      XML; what an ATT&CK technique is.
- [ ] Learn Kerberos basics that power 3 of the 4 techniques: TGT vs. TGS, pre-auth,
      encryption types (RC4 `0x17` vs. AES).
- [ ] Run `pytest ci/test_offline.py -v` with the lab off — it passes today and teaches the
      repo's structure.
- **Done when** you can explain, in your own words, the manager vs. the indexer, and why
  RC4 is the Kerberoasting tell.

## Phase 1 — Isolated lab network (Weeks 1–2) — *slow down here; growth area*
- [ ] Build the lab VLAN on OPNsense; assign + enable the interface.
- [ ] Confirm **outbound NAT covers the new subnet** (the #1 past failure).
- [ ] Static IPs / DHCP reservations (no plain DHCP → avoids `/32` drift).
- [ ] From a lab host: `ping <gateway>` and (if outbound intended) `ping 1.1.1.1`.
- [ ] Fill in `secrets/network.md` (gitignored) with the real values.
- **Done when** you can draw the network from memory and explain how a lab host stays
  isolated yet still reaches the internet via NAT.

## Phase 2 — Stand up Wazuh (Weeks 2–3)
- [ ] Wazuh all-in-one installed; indexer heap capped (`-Xms2g -Xmx2g`); dashboard off unless needed.
- [ ] Manager API returns a token (55000); indexer health is green (9200).
- [ ] Understand *why* two APIs = a two-tier test: `/logtest` (deterministic unit) vs.
      indexer `_search` (real integration).
- **Done when** you can explain what each API proves and why the project uses **both**.

## Phase 3 — AD lab + real telemetry (Weeks 3–4) — *your strong area, moves fast*
- [ ] Server Core DC (`Install-ADDSForest`); Windows workstation domain-joined.
- [ ] Sysmon (SwiftOnSecurity base) + Wazuh agents green on both.
- [ ] Audit policy emitting 4769/4768/4662/4624 (incl. the 4662 SACL on the domain NC).
- [ ] Seed the deliberately weak accounts (`svc_sql`, `svc_legacy`, the DCSync grant),
      documented so hardening has something to reverse.
- **Milestone:** you can now generate **real events** — this is what makes detection work
  authentic instead of theoretical.

## Phase 4 — Detection engineering BY HAND, one technique (Weeks 5–6) — *the core*
Kerberoasting only. This is where you actually learn detection.
- [ ] Move generated `kerberoasting.yml` + its Wazuh block into `reference/` — don't peek.
- [ ] Fire atomic #4 by hand on the target; pull the **real 4769** from Wazuh.
- [ ] Read the real fields; write **your own** Sigma rule from the MS 4769 docs + telemetry.
- [ ] Translate to **your own** Wazuh XML rule; deploy by hand (copy `local_rules.xml`,
      reload) — **no Ansible yet**.
- [ ] Test with `/logtest`. Watch it misbehave (e.g. the `\$$` vs `$@*` machine-account
      reduction — real `TargetUserName` looks like `WS01$@LAB.LOCAL`). Debug. Fix.
- [ ] Diff yours against `reference/`; understand every difference.
- [ ] Write `writeups/kerberoasting.md` yourself — your report's first real section.
- **Done when** you can explain every field and every reduction in *your* rule, including
  the one that was wrong at first.

## Phase 5 — Automate the deploy with Ansible (Week 7) — *this is where Ansible belongs*
Automate the thing you now understand by hand.
- [ ] Read the generated `ansible/deploy-rule.yml`; rewrite/annotate it yourself; run it.
- [ ] Understand the safety pattern: backup → validate (`wazuh-analysisd -t`) → `rescue`
      restore → reload only if valid.
- **Done when** you can explain what happens when a bad rule is deployed (rescue restores
  the old ruleset; the manager never loads broken rules).

## Phase 6 — Wrap it in CI (Weeks 8–9) — *big new-skill area: CI + Python*
- [ ] Gitea + two Act runners (`linux` on the LXC, `windows` on the target) + GitHub mirror.
- [ ] Understand `.gitea/workflows/detect.yml` line by line, and the Python scripts
      `logtest_unit.py` + `confirm_alert.py`.
- [ ] Solve the ordering flaw: `detect` runs before `deploy`, but a brand-new rule isn't on
      the manager yet — design a deploy-candidate-first / seed-the-rule fix. (Great report section.)
- **Milestone:** **Kerberoasting green end-to-end in CI** — the project's headline, now yours.

## Phase 7 — Scale to the other three techniques (Weeks 10–12)
- [ ] DCSync (SACL / replication rights) — rewrite from scratch, diff, write the writeup.
- [ ] AS-REP roasting (pre-auth disabled) — Defender-off snapshot workflow.
- [ ] Pass-the-Hash (logon type 9 via `seclogo`) — Defender-off snapshot workflow.
- [ ] Each green in CI before starting the next.

## Phase 8 — Coverage heatmap (Weeks 12–13)
- [ ] Generate the ATT&CK Navigator layer (`heatmap/gen_layer.sh`); open it in Navigator.
- [ ] Understand what it communicates — it's your best presentation slide.

## Phase 9 — Report, presentation, stretch goal (Weeks 13–15)
- [ ] Assemble the **report** from your incremental writeups + lab journal.
- [ ] Build the **presentation**: architecture diagram + a live demo (push a commit, watch
      CI catch a real attack) + the heatmap.
- [ ] **Stretch:** open one genuinely portable Sigma rule as a **SigmaHQ PR** — a real
      open-source detection-engineering credit.
- [ ] **Final check:** mock interview — defend any part on demand. That's portfolio-ready.

---

## How to use Claude on this project
Not as a code generator. As a **quizmaster, reviewer, and debugger**:
- Ask it to explain concepts (Kerberos, Sigma, Wazuh internals) or to grill you on your
  own rules until you can defend them.
- Bring it rules *you* wrote for review — it finds the gaps; it doesn't write them for you.
- Debug together when you're genuinely stuck, after you've tried.
