#!/usr/bin/env python3
"""INTEGRATION TEST: after the live attack fires, poll the Wazuh indexer until the
expected alert lands (or the timeout expires).

This is the end-to-end proof the pipeline is built around: it is not enough that a
rule *can* match a crafted sample (that is logtest_unit.py) — the real attack must
generate real telemetry that the deployed rule catches and the indexer stores.

    # look up rule.id + attack.id from the manifest by technique:
    python ci/confirm_alert.py --technique kerberoasting --since now-10m --timeout 180

    # or specify directly:
    python ci/confirm_alert.py --rule-id 100201 --attack-id T1558.003 --since now-10m

Exit 0 = at least one matching alert found in the window; non-zero = none (build red).
"""
from __future__ import annotations

import argparse
import sys
import time

import config
from wazuh_client import WazuhError, indexer_from_config


def _lookup(technique: str) -> dict:
    for case in config.manifest_cases():
        if case["technique"] == technique:
            return case
    raise SystemExit(f"No manifest case for technique '{technique}'")


def build_query(rule_id: str | None, attack_id: str | None, since: str) -> dict:
    """A bool query: matching rule (by id and/or ATT&CK id) within [since, now]."""
    should = []
    if rule_id:
        should.append({"term": {"rule.id": str(rule_id)}})
    if attack_id:
        should.append({"term": {"rule.mitre.id": attack_id}})
    if not should:
        raise SystemExit("Need at least one of --rule-id / --attack-id")
    return {
        "size": 5,
        "sort": [{"timestamp": {"order": "desc"}}],
        "query": {
            "bool": {
                "must": [{"range": {"timestamp": {"gte": since, "lte": "now"}}}],
                "minimum_should_match": 1,
                "should": should,
            }
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--technique", help="manifest technique key to derive rule/attack ids")
    parser.add_argument("--rule-id", help="Wazuh rule.id to look for")
    parser.add_argument("--attack-id", help="ATT&CK technique id, e.g. T1558.003")
    parser.add_argument("--since", default="now-15m",
                        help="ES date-math or ISO8601 lower bound (default now-15m)")
    parser.add_argument("--timeout", type=int, default=180,
                        help="seconds to keep polling before giving up (default 180)")
    parser.add_argument("--interval", type=int, default=10,
                        help="seconds between polls (default 10)")
    args = parser.parse_args()

    rule_id, attack_id = args.rule_id, args.attack_id
    if args.technique:
        case = _lookup(args.technique)
        rule_id = rule_id or case["expected_rule_id"]
        attack_id = attack_id or case["attack_id"]

    query = build_query(rule_id, attack_id, args.since)
    indexer = indexer_from_config()
    label = f"rule.id={rule_id or '-'} / {attack_id or '-'}"
    deadline = time.time() + args.timeout
    attempt = 0

    print(f"Polling {config.ALERTS_INDEX} for {label} since {args.since} "
          f"(timeout {args.timeout}s)...")
    while True:
        attempt += 1
        try:
            result = indexer.search(config.ALERTS_INDEX, query)
        except WazuhError as exc:
            # The indexer can lag a beat behind the manager; keep trying until the deadline.
            print(f"  attempt {attempt}: {exc}", file=sys.stderr)
            result = None
        if result:
            count = indexer.hit_count(result)
            if count > 0:
                top = result["hits"]["hits"][0]["_source"]
                ts = top.get("timestamp", "?")
                desc = top.get("rule", {}).get("description", "")
                print(f"[PASS] Found {count} alert(s) for {label}. "
                      f"Most recent {ts}: {desc}")
                return 0
            print(f"  attempt {attempt}: no alert yet")
        if time.time() >= deadline:
            print(f"[FAIL] No alert for {label} within {args.timeout}s. "
                  f"The attack did not produce a caught detection.", file=sys.stderr)
            return 1
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
