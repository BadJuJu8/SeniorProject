# secrets/ — never commit real infrastructure detail

Everything in this folder is gitignored **except** this `README.md` and any `*.example.md`
templates. Real values live here and stay local; they are never pushed.

Put real values here:
- `network.md` — your actual OPNsense/Proxmox topology (VLAN IDs, subnets, gateway IPs, WireGuard)
- credentials, API tokens, Wazuh passwords, Ansible vault passwords

## Why

This is a public portfolio repo. Real network topology and credentials are exactly what an
attacker wants, and publishing them is the opposite of the security discipline this project
demonstrates. Keep the *methodology* public and the *specifics* private.

## How

Copy `network.example.md` to `network.md` and fill it in. `network.md` is gitignored, so it will
never be pushed. The pipeline reads sensitive values from here (or from environment variables /
Ansible vault), never from committed files.
