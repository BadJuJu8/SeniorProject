#!/usr/bin/env python3
"""UNIT TEST: feed each sample event to the Wazuh manager /logtest API and assert
the expected local rule fired.

This is the fast, deterministic gate of the pipeline. It needs the Wazuh manager
reachable (port 55000) but NOT the AD lab powered on — no attack is fired. Every
case in tests/samples/manifest.json is checked; any miss fails the build.

    python ci/logtest_unit.py                 # all cases
    python ci/logtest_unit.py --technique dcsync
    python ci/logtest_unit.py --sample tests/samples/4769_kerberoast.json --rule-id 100201

Exit code 0 = every expected rule matched; non-zero = at least one miss/error.
"""
from __future__ import annotations

import argparse
import json
import sys

import config
from wazuh_client import WazuhError, manager_from_config


def _compact(sample_path) -> str:
    """Load a sample file and return it as a single-line JSON string for /logtest."""
    with open(sample_path, encoding="utf-8") as fh:
        return json.dumps(json.load(fh), separators=(",", ":"))


def _cases_from_args(args) -> list[dict]:
    if args.sample:
        if not args.rule_id:
            raise SystemExit("--sample requires --rule-id")
        return [{
            "technique": "adhoc",
            "sample": args.sample,
            "expected_rule_id": str(args.rule_id),
        }]
    cases = config.manifest_cases()
    if args.technique:
        cases = [c for c in cases if c["technique"] == args.technique]
        if not cases:
            raise SystemExit(f"No manifest case for technique '{args.technique}'")
    return cases


def _resolve_sample(sample: str):
    """Accept either a bare filename (under tests/samples/) or a full path."""
    from pathlib import Path

    p = Path(sample)
    return p if p.is_absolute() or p.exists() else config.SAMPLES_DIR / sample


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--technique", help="only run the manifest case with this technique key")
    parser.add_argument("--sample", help="path to a single sample event (requires --rule-id)")
    parser.add_argument("--rule-id", help="expected rule.id for --sample")
    args = parser.parse_args()

    cases = _cases_from_args(args)
    manager = manager_from_config()
    try:
        manager.authenticate()
    except WazuhError as exc:
        print(f"[FATAL] {exc}", file=sys.stderr)
        return 2

    failures = 0
    for case in cases:
        tech = case["technique"]
        expected = str(case["expected_rule_id"])
        sample_path = _resolve_sample(case["sample"])
        try:
            data = manager.logtest(_compact(sample_path))
        except WazuhError as exc:
            print(f"[ERROR] {tech}: {exc}", file=sys.stderr)
            failures += 1
            continue
        fired = manager.matched_rule_id(data)
        if fired == expected:
            level = (data.get("output") or {}).get("rule", {}).get("level", "?")
            print(f"[PASS]  {tech:<16} sample -> rule.id {fired} (level {level})")
        else:
            failures += 1
            print(f"[FAIL]  {tech:<16} expected rule.id {expected}, got {fired or 'no match'}",
                  file=sys.stderr)
            for msg in data.get("messages", []) or []:
                print(f"           logtest: {msg}", file=sys.stderr)

    total = len(cases)
    passed = total - failures
    print(f"\nUnit test: {passed}/{total} rules matched their sample event.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
