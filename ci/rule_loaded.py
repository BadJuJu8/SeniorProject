#!/usr/bin/env python3
"""PRE-FLIGHT: ask the Wazuh manager API whether each manifest rule is loaded.

Replaces /logtest as the fast gate before the live atomic fires. /logtest cannot
reproduce agent-delivered Windows events: a pasted 4769 is always claimed by the
generic `json` decoder, never `windows_eventchannel`, whatever log_format is sent
(proven 2026-10-14, see docs/LAB_JOURNAL.md). So for Windows rules, `if_group
windows_security` is never evaluated under logtest, and the live atomic plus the
indexer search (confirm_alert.py) is the only real proof that a rule fires.

What this does prove, fast and without firing anything: the manager is reachable,
the CI credentials work, and the rule is loaded from local_rules.xml (a rule that
failed to parse or was never deployed comes back missing).

    python ci/rule_loaded.py                      # every manifest case
    python ci/rule_loaded.py --technique kerberoasting

Exit code 0 = every expected rule is loaded; 1 = at least one missing; 2 = can't
reach or authenticate to the manager.
"""
from __future__ import annotations

import argparse
import sys

import config
from wazuh_client import WazuhError, manager_from_config


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--technique", help="only check the manifest case with this technique key")
    args = parser.parse_args()

    cases = config.manifest_cases()
    if args.technique:
        cases = [c for c in cases if c["technique"] == args.technique]
        if not cases:
            raise SystemExit(f"No manifest case for technique '{args.technique}'")

    manager = manager_from_config()
    try:
        manager.authenticate()
    except WazuhError as exc:
        print(f"[FATAL] {exc}", file=sys.stderr)
        return 2

    failures = 0
    for case in cases:
        tech = case["technique"]
        rule_id = str(case["expected_rule_id"])
        try:
            rule = manager.get_rule(rule_id)
        except WazuhError as exc:
            print(f"[ERROR] {tech}: {exc}", file=sys.stderr)
            failures += 1
            continue
        if rule is None:
            failures += 1
            print(f"[FAIL]  {tech:<16} rule.id {rule_id} is not loaded on the manager",
                  file=sys.stderr)
            continue
        print(f"[PASS]  {tech:<16} rule.id {rule_id} loaded (level {rule.get('level', '?')}, "
              f"{rule.get('filename', '?')}, {rule.get('status', '?')})")

    total = len(cases)
    print(f"\nPre-flight: {total - failures}/{total} rules loaded on the manager.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
