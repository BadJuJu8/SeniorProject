# Negative fixtures parked during repo cleanup (their samples live in _later/tests/samples/).
# Paste each back into ci/test_offline.py when its technique returns.

def test_network_logon_not_pth():
    ev = _load("4624_pth.json")
    ev["win"]["eventdata"]["logonType"] = "3"   # ordinary network logon
    assert not rule_matches("100231", ev)
