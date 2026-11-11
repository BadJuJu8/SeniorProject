"""Offline test suite — runs with the lab powered down and no network.

It is the developer-workstation and Gitea-server safety net that guards the repo's
correctness before anything touches the live SIEM:

  * every Sigma rule parses, has the required keys, a UUID id, and ATT&CK tags;
  * local_rules.xml is well-formed and defines every rule.id the manifest expects;
  * every manifest sample fires ITS rule and no other alerting rule (specificity);
  * hand-built negative fixtures do NOT fire, proving the reductions hold.

The Wazuh field/negate matching is re-implemented here in Python so these assertions
hold anywhere. It is a faithful-enough model of analysisd's regex+negate semantics
for unit purposes; the authoritative check remains ci/logtest_unit.py against a live
manager.

Run:  pytest ci/test_offline.py -v      (or just `pytest` from the repo root)
"""
from __future__ import annotations

import json
import re
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[1]
SAMPLES = REPO / "tests" / "samples"
SIGMA_DIR = REPO / "rules" / "sigma"
WAZUH_XML = REPO / "rules" / "wazuh" / "local_rules.xml"
MANIFEST = json.loads((SAMPLES / "manifest.json").read_text(encoding="utf-8"))
CASES = MANIFEST["cases"]


# --------------------------------------------------------------------------- #
# A small model of the Wazuh rule set                                         #
# --------------------------------------------------------------------------- #
class WazuhRule:
    def __init__(self, elem: ET.Element):
        self.id = elem.get("id")
        self.level = int(elem.get("level", "0"))
        self.if_sid = (elem.findtext("if_sid") or "").strip() or None
        self.fields = []  # (name, compiled_regex, negate)
        for f in elem.findall("field"):
            name = f.get("name")
            negate = f.get("negate", "no") == "yes"
            pattern = (f.text or "").strip()
            self.fields.append((name, re.compile(pattern), negate))


def load_rules() -> dict[str, WazuhRule]:
    root = ET.parse(WAZUH_XML).getroot()
    return {r.get("id"): WazuhRule(r) for r in root.findall("rule")}


RULES = load_rules()


def _chain_fields(rule_id: str) -> list[tuple[str, re.Pattern, bool]]:
    """All field predicates for a rule plus every ancestor via <if_sid>."""
    fields: list[tuple[str, re.Pattern, bool]] = []
    seen: set[str] = set()
    rid = rule_id
    while rid and rid in RULES and rid not in seen:
        seen.add(rid)
        rule = RULES[rid]
        fields.extend(rule.fields)
        rid = rule.if_sid
    return fields


def flatten_event(event: dict) -> dict[str, str]:
    """Flatten {'win': {'system': {...}, 'eventdata': {...}}} to dotted keys."""
    flat: dict[str, str] = {}

    def rec(node, prefix):
        for k, v in node.items():
            key = f"{prefix}{k}"
            if isinstance(v, dict):
                rec(v, key + ".")
            else:
                flat[key] = str(v)

    rec(event, "")
    return flat


def rule_matches(rule_id: str, event: dict) -> bool:
    flat = flatten_event(event)
    for name, rx, negate in _chain_fields(rule_id):
        value = flat.get(name)
        if value is None:
            # Positive predicate can't match a missing field; a negated predicate
            # on a missing field is considered satisfied (nothing to match).
            if not negate:
                return False
            continue
        hit = rx.search(value) is not None
        if negate and hit:
            return False
        if not negate and not hit:
            return False
    return True


def alerting_rule_ids() -> list[str]:
    return [rid for rid, r in RULES.items() if r.level >= 12]


# --------------------------------------------------------------------------- #
# Sigma rules                                                                  #
# --------------------------------------------------------------------------- #
SIGMA_FILES = sorted(SIGMA_DIR.glob("*.yml"))


def test_sigma_files_present():
    assert SIGMA_FILES, "no Sigma rules found under rules/sigma/"


@pytest.mark.parametrize("path", SIGMA_FILES, ids=lambda p: p.name)
def test_sigma_rule_valid(path: Path):
    rule = yaml.safe_load(path.read_text(encoding="utf-8"))
    for key in ("title", "id", "status", "logsource", "detection", "level"):
        assert key in rule, f"{path.name} missing required key '{key}'"
    # id must be a real UUID
    uuid.UUID(str(rule["id"]))
    # must carry an ATT&CK technique tag
    tags = [str(t) for t in rule.get("tags", [])]
    assert any(t.startswith("attack.t") for t in tags), f"{path.name} has no attack.tXXXX tag"
    assert "condition" in rule["detection"], f"{path.name} detection has no condition"


def test_sigma_ids_unique():
    ids = [yaml.safe_load(p.read_text(encoding="utf-8"))["id"] for p in SIGMA_FILES]
    assert len(ids) == len(set(ids)), "duplicate Sigma rule ids"


# --------------------------------------------------------------------------- #
# Wazuh XML                                                                    #
# --------------------------------------------------------------------------- #
def test_wazuh_xml_wellformed():
    ET.parse(WAZUH_XML)  # raises on malformed XML


def test_expected_rule_ids_exist():
    for case in CASES:
        assert case["expected_rule_id"] in RULES, \
            f"{case['technique']}: rule.id {case['expected_rule_id']} not in local_rules.xml"


# --------------------------------------------------------------------------- #
# Manifest wiring                                                              #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("case", CASES, ids=[c["technique"] for c in CASES])
def test_manifest_files_exist(case):
    assert (SAMPLES / case["sample"]).is_file(), f"missing sample {case['sample']}"
    assert (REPO / case["sigma"]).is_file(), f"missing sigma {case['sigma']}"
    assert (REPO / case["writeup"]).is_file(), f"missing writeup {case['writeup']}"


@pytest.mark.parametrize("case", CASES, ids=[c["technique"] for c in CASES])
def test_sigma_attack_id_matches_manifest(case):
    rule = yaml.safe_load((REPO / case["sigma"]).read_text(encoding="utf-8"))
    tag = "attack." + case["attack_id"].lower()
    assert tag in [str(t) for t in rule.get("tags", [])], \
        f"{case['sigma']} is missing tag {tag}"


# --------------------------------------------------------------------------- #
# The core assertion: each sample fires its rule and only its rule            #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("case", CASES, ids=[c["technique"] for c in CASES])
def test_sample_fires_expected_rule(case):
    event = json.loads((SAMPLES / case["sample"]).read_text(encoding="utf-8"))
    expected = case["expected_rule_id"]
    assert rule_matches(expected, event), \
        f"{case['technique']}: sample did NOT match rule {expected}"


@pytest.mark.parametrize("case", CASES, ids=[c["technique"] for c in CASES])
def test_sample_is_specific(case):
    """A sample must fire only its own alerting rule, nothing else."""
    event = json.loads((SAMPLES / case["sample"]).read_text(encoding="utf-8"))
    fired = [rid for rid in alerting_rule_ids() if rule_matches(rid, event)]
    assert fired == [case["expected_rule_id"]], \
        f"{case['technique']}: expected only {case['expected_rule_id']} to fire, got {fired}"


# --------------------------------------------------------------------------- #
# Negative fixtures: the reductions must suppress benign activity             #
# --------------------------------------------------------------------------- #
def _load(sample: str) -> dict:
    return json.loads((SAMPLES / sample).read_text(encoding="utf-8"))


def test_machine_account_kerberoast_suppressed():
    ev = _load("4769_kerberoast.json")
    ev["win"]["eventdata"]["serviceName"] = "DC01$"   # machine SPN — benign
    assert not rule_matches("100201", ev)


def test_krbtgt_kerberoast_suppressed():
    ev = _load("4769_kerberoast.json")
    ev["win"]["eventdata"]["serviceName"] = "krbtgt"
    assert not rule_matches("100201", ev)


def test_aes_ticket_not_kerberoast():
    ev = _load("4769_kerberoast.json")
    ev["win"]["eventdata"]["ticketEncryptionType"] = "0x12"  # AES256 — not roastable
    assert not rule_matches("100201", ev)


# --------------------------------------------------------------------------- #
# Candidate (shadow deploy): ci/make_candidate.py                             #
# --------------------------------------------------------------------------- #
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_candidate  # noqa: E402

CANDIDATE_CASES = [c for c in CASES if c.get("candidate_rule_id")]


def _fields(rule: ET.Element) -> list[tuple]:
    return [(f.get("name"), f.get("negate"), f.get("type"), f.text) for f in rule.findall("field")]


def test_some_case_has_a_candidate_id():
    assert CANDIDATE_CASES, "no manifest case has a candidate_rule_id"


@pytest.mark.parametrize("case", CANDIDATE_CASES, ids=[c["technique"] for c in CANDIDATE_CASES])
def test_candidate_is_child_of_live_rule_with_same_conditions(case):
    group = make_candidate.build([case])
    # Round-trip through text: what gets staged must be well-formed XML.
    group = ET.fromstring(make_candidate.render(group))
    rules = group.findall("rule")
    assert len(rules) == 1
    cand = rules[0]
    live = next(r for r in ET.parse(WAZUH_XML).getroot().iter("rule")
                if r.get("id") == case["expected_rule_id"])

    assert cand.get("id") == case["candidate_rule_id"]
    assert cand.get("level") == live.get("level")
    # Exactly one parent condition: the live rule.
    assert [c.text for c in cand.findall("if_sid")] == [case["expected_rule_id"]]
    for tag in make_candidate.PARENT_TAGS - {"if_sid"}:
        assert cand.find(tag) is None, f"candidate still has <{tag}>"
    # The commit's field conditions are carried over untouched.
    assert _fields(cand) == _fields(live)
    assert "candidate" in cand.findtext("group").split(",")
    assert cand.findtext("description").startswith("[candidate] ")


def test_candidate_id_must_not_collide_with_a_real_rule():
    case = dict(CANDIDATE_CASES[0], candidate_rule_id=CANDIDATE_CASES[0]["expected_rule_id"])
    with pytest.raises(make_candidate.CandidateError):
        make_candidate.build([case])


def test_candidate_id_must_be_in_custom_range():
    case = dict(CANDIDATE_CASES[0], candidate_rule_id="99999")
    with pytest.raises(make_candidate.CandidateError):
        make_candidate.build([case])
