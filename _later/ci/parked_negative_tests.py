# Negative fixtures parked during repo cleanup (their samples live in _later/tests/samples/).
# Paste each back into ci/test_offline.py when its technique returns.

def test_preauth_required_not_asrep():
    ev = _load("4768_asrep.json")
    ev["win"]["eventdata"]["preAuthType"] = "2"   # pre-auth enforced
    assert not rule_matches("100211", ev)


def test_dc_replication_not_dcsync():
    ev = _load("4662_dcsync.json")
    ev["win"]["eventdata"]["subjectUserName"] = "DC02$"  # legit DC-to-DC replication
    assert not rule_matches("100221", ev)


def test_network_logon_not_pth():
    ev = _load("4624_pth.json")
    ev["win"]["eventdata"]["logonType"] = "3"   # ordinary network logon
    assert not rule_matches("100231", ev)
