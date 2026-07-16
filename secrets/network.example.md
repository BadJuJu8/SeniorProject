# Network topology  (EXAMPLE — copy to `network.md` and fill in; `network.md` is gitignored)

The example values below are illustrative only. Replace every field with your real setup in
`network.md`. Write "not sure" on anything you need help figuring out.

## A. Lab VLAN identity
- VLAN ID (802.1Q tag):            50
- Lab subnet + CIDR:               10.10.50.0/24
- Gateway IP (OPNsense on VLAN):   10.10.50.1
- Addressing (static / DHCP resv): static

## B. OPNsense
- Physical parent NIC for VLANs:   igc1
- Lab VLAN interface name:         OPT3 ("LAB")
- Outbound NAT covers lab CIDR?:   yes / no
- Firewall rules on lab iface:     default block + explicit allows
- DHCP scope on lab VLAN:          none (static) / range
- DNS resolver lab hosts use:      Unbound on OPNsense
- WireGuard reach into lab:        yes, allowed-IPs 10.10.50.0/24

## C. Proxmox host
- Management IP + its VLAN/bridge:
- vmbr0 VLAN-aware? other bridges?:
- Guest VLAN tagging method:       NIC VLAN tag
- Free RAM / storage pool:

## D. Component attach points
- Wazuh all-in-one VM  -> VLAN/bridge:
- Gitea LXC            -> VLAN/bridge (mgmt or lab?):
- Windows DC           -> lab VLAN:
- Windows workstation  -> lab VLAN:
- Runner -> Wazuh 55000/9200 + targets (same VLAN or crossing?):

## E. Outbound the lab genuinely needs
- Windows activation/updates:
- Wazuh agent/module + ruleset updates:
- Package installs (sigma-cli, S2AN, Ansible, Invoke-AtomicRedTeam):
- Policy (allow lab->internet / staged offline):

## F. GitHub mirror
- Gitea LXC outbound to github.com:  yes / no
