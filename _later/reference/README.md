# reference/ — the pre-authored "answer key"

These are the **generated** detections that shipped with the repo, preserved unchanged
per `docs/LEARNING_PLAN.md` Phase 4. They are the *answer key*: you rebuild each detection
by hand from live telemetry, then diff your version against the one here.

**Nothing in this folder is loaded by the Wazuh manager or read by the CI.** The canonical,
hand-authored detections live in `rules/`. This folder exists only so the comparison stays
auditable.

## Kerberoasting (T1558.003)
- `rules/sigma/kerberoasting.yml` — the reference Sigma rule.
- `rules/wazuh/kerberoasting.xml` — the reference Wazuh rule block (100200/100201).

The hand-authored version that supersedes these — and the reasoning behind every
difference (why `status=0x0` was kept, why the `targetUserName` reduction was changed from
`\$$` to `\$@`, why `ticketOptions` was dropped) — lives in `docs/LAB_JOURNAL.md`.
