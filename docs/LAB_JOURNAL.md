# LAB_JOURNAL.md — what we did, what it means, why

This is the project's living notebook — the "dated lab journal" `docs/LEARNING_PLAN.md` (line 17)
asks for. We **add** to it every session; we don't rewrite it. It has two halves:

- **Concepts** — a glossary that grows. Every time a new term or tool shows up, it gets a
  plain-language entry here that you can re-read cold months later and still get.
- **Session log** — dated entries: the goal, what we ran, what each command actually did, what
  we saw, and what broke.

House rules for this file:
- It's **committed** — methodology is meant to be public for this portfolio.
- **No real credentials in here.** Deliberately-weak fixture passwords live in
  `secrets/lab-fixtures.md` (gitignored). This file names the accounts, never their passwords.
- Plain language first. If a piece of jargon is unavoidable, it gets a Concepts entry.

---

## Concepts (glossary — grows as we go)

### Kerberos & Active Directory

**Kerberos** — the authentication system Active Directory uses. Instead of sending your password
to every service, you prove who you are **once** to a domain controller and get time-limited
*tickets* that vouch for you. Analogy: I went to the OC fair and ordered a margarita, the workers know that people typically get more than one alcoholic beverage throughout their visit, so they gave me a wrist band after checking my ID, after that they only need to look at my wristband.

**Domain Controller (DC)** — the server that runs Active Directory: it holds the user/computer
accounts and issues the Kerberos tickets. Yours is `robslab.local` (`ROBSLAB`).

**TGT vs TGS** — two kinds of ticket. The **TGT** (Ticket-Granting Ticket) is the wristband you
get at the gate — it proves who you are. A **TGS** (Ticket-Granting Service ticket) is a per-ride
ticket you trade the wristband for, to reach one specific service. **Kerberoasting abuses the TGS
step.**

**SPN (Service Principal Name)** — a label on an account that says "this account runs service X at
location Y," e.g. `MSSQLSvc/db01.robslab.local:1433`. It's how Kerberos knows *which account's key* to encrypt a service ticket with. **Only an account that has an SPN can have a service ticket
requested for it** — so an SPN is the prerequisite for being Kerberoastable.

**KRBTGT** — the special built-in account whose secret key signs every TGT. It showed up in your
SPN search because it technically has an SPN (`kadmin/changepw`), but it is **not** a roast target:
it's not a service account with a human-set, crackable password, and requesting its ticket isn't
the attack. That's why "only `krbtgt` came back" meant "you have no real target yet."

**Kerberoasting (MITRE ATT&CK T1558.003)** — the attack, in one breath: any logged-in domain user
asks the DC for a service ticket (TGS) for an account that has an SPN. The DC hands back that ticket
**encrypted with the service account's password hash**. The attacker saves it and cracks it
**offline**, at their leisure, with no further contact with the DC — so the cracking itself is
invisible. The one catchable moment is the *request*, which the DC logs as **event 4769**.

**Encryption types — RC4 (`0x17`) vs AES (`0x12`)** — the cipher used to encrypt the ticket. RC4 is
old and weak; AES is modern and strong. Attackers *prefer* RC4 tickets because they crack far
faster offline. Legit modern AD traffic is mostly AES, so a service ticket requested with **RC4
(`0x17`)** stands out — **that contrast is the signature we detect.** Real-world vulnerable accounts
are often legacy services stuck on RC4.

**msDS-SupportedEncryptionTypes** — an AD account attribute (a bitmask) listing which Kerberos
encryption types the account accepts. We set `svc_sql`'s to `4` (RC4 only) so its tickets come back
as `0x17` — making it behave like the legacy accounts these attacks target, and guaranteeing our
detectable signature. Bit values: `1`=DES-CRC, `2`=DES-MD5, `4`=RC4, `8`=AES128, `16`=AES256.

**Ticket Encryption Type vs Session Key Encryption Type** — a 4769 reports both. The **Ticket
Encryption Type** is the cipher protecting the *service ticket itself*, using the service account's
password-derived key — that is the ciphertext an attacker cracks offline, so `0x17` here is **the**
Kerberoasting tell. The **Session Key Encryption Type** is the cipher of the session key the client
and service use to talk — related, but not the thing that gets cracked. In our live capture both were
`0x17` because `svc_sql` is RC4-only.

**Deliberately weak / roastable account** — a service account we create *on purpose* with (a) an
SPN so tickets can be requested for it, (b) a weak, crackable password, and (c) RC4 enabled. Without one, there is literally nothing to attack — you can't practice *catching* Kerberoasting if no
account is Kerberoastable. This is the "vulnerable AD" the whole project exists to detect against.
We document the account (not its password) so that later, when we build the hardening layer, there's a known weakness to reverse.

### Windows auditing & telemetry

**Audit policy** — Windows doesn't log everything by default (it would drown in noise). Audit policy
is the set of switches deciding *which* security events get written to the Security event log. **If
the switch is off, the event never exists** — you can't detect what was never recorded.

**Advanced Audit Policy / subcategories** — a finer-grained audit policy: instead of one coarse
"log account logons" switch, there are ~60 subcategories. The one called **"Kerberos Service Ticket
Operations"** controls whether 4769 (service-ticket requests) get logged.

**auditpol** — the command-line tool to read and set those subcategories.
`auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable` flipped the exact
switch that makes the DC record a **4769** every time someone successfully requests a service ticket.
Before: `No Auditing` (zero 4769s ever written). After: `Success`. **This is the switch that turns
your telemetry on** — without it the attack happens silently and there's nothing for Wazuh to catch.

**Event ID 4769** — the Windows Security-log event "A Kerberos service ticket was requested." One is
written per TGS request. Key fields: the **service/SPN** requested, the **account** that asked, and
the **ticket encryption type** (our `0x17` tell). This single event is the detection surface for
Kerberoasting.

**Wazuh: agent → manager → indexer** — three roles. The **agent** runs on each monitored host (your
DC) and ships its logs. The **manager** receives them and runs detection rules against them. The
**indexer** stores them and makes them searchable — that's where you go to hunt for your 4769. Your
VM 105 runs all three (all-in-one).

### Writing Wazuh detection rules

**Where rules live** — Wazuh ships thousands of built-in rules in `/var/ossec/ruleset/rules/` (the
Windows-security ones are what fired only rule `60106` on our roast). **Never edit those** — an
update overwrites them. Your own rules go in one file you own: `/var/ossec/etc/rules/local_rules.xml`.
That's where our Kerberoasting rule will live.

**Decoders vs rules** — two stages. A **decoder** parses a raw log into named fields (the
`windows_eventchannel` decoder is what turns the DC's raw XML event into the `data.win.system.*` /
`data.win.eventdata.*` fields you saw in the indexer). A **rule** then evaluates those fields and
decides whether to alert. Decoders extract; rules judge. We already have decoded fields, so we're
writing a rule, not a decoder.

**Rule id (a.k.a. "SID")** — every rule has a unique number. Wazuh reserves `0–99999` for its own
ruleset; **your custom rules must use `id` ≥ 100000** (100000–120000 is the user range). Reuse an
existing id and the manager refuses to load. ⚠️ **Naming trap:** a Wazuh "SID" = *rule signature id*
(e.g. `100100`). It is **not** the Windows **SID** (`S-1-5-21-…` security identifier) you saw in the
4769's `serviceSid`. Same three letters, completely different things.

**level** — the alert severity, `0–16` on Wazuh's own scale. `0` = matched but *don't* alert (used to
silence noise); `2–4` = low/info; `5–9` = notable; `10–12` = likely attack; `13–16` = critical. The
manager only logs/indexes alerts at or above its threshold (default `3`), so level decides both
*whether* your alert surfaces and *how loud* it is. A real Kerberoast wants ~`10–12`.

**if_sid / if_group — the rule tree** — Wazuh rules form a hierarchy. `<if_sid>N</if_sid>` means "only
test this rule if rule `N` already matched this event"; `<if_group>windows_security</if_group>` means
"only if some rule tagged `windows_security` matched." You chain your specific rule onto a broad
parent so (a) it only runs on relevant events and (b) it inherits context. This is performance *and*
correctness — the manager tests thousands of rules per event, and the tree prunes everything
irrelevant before your rule is considered. For a Windows-security event, chaining off the group
`windows_security` is the robust choice; find the exact base SID on *your* manager rather than
trusting a blog (trace the parent of rule `60106`, the one that fired on our capture).

**`<group name="…">`** — wraps one or more rules and tags them with comma-separated group names
(trailing comma is a Wazuh convention: `name="windows,kerberoasting,"`). Groups organize rules and are
what `if_group` matches on.

**`<field name="…">regex</field>` — the actual matching** — each `<field>` tests one decoded field,
and **the value is a regular expression, not exact-equals.** Multiple `<field>` lines in one rule are
**AND**ed together. `negate="yes"` inverts a single field (that's our machine-account exclusion). Two
gotchas: (1) in the rule you **drop the `data.` prefix** — the indexer shows
`data.win.eventdata.serviceName`, but the rule writes `win.eventdata.serviceName`. (2) Wazuh's
**default regex engine is OS_Regex (its own dialect), not PCRE** — anchoring and escaping differ; add
`type="pcre2"` to a `<field>` to use familiar PCRE instead. This is exactly why matching `0x17` and
"ends in `$`" needs care.

**Testing — `wazuh-logtest` / the logtest API (:55000)** — feed a raw event in and it reports which
rule fired, at what level, and how the fields decoded. This is the deterministic unit test for a rule:
confirm it fires on the real 4769 (and *stays quiet* on noise) before trusting it. Separately,
`wazuh-analysisd -t` validates that the whole ruleset still parses — run it before every reload so a
broken rule never loads.

### Tools & commands seen so far

**setspn** — view/add/remove SPNs on accounts. `setspn -A MSSQLSvc/db01.robslab.local:1433 svc_sql`
attached that service label to `svc_sql` — which is what *makes it roastable* (something can now
request a service ticket for it). `setspn -L svc_sql` lists an account's SPNs. The host in the SPN
(`db01`) does **not** have to exist; only the label on the account matters.

**klist** — shows the Kerberos tickets currently cached on your machine. After firing the attack,
`klist` should list a ticket for `MSSQLSvc/db01.robslab.local` — proof the request went through, and
the very same request the DC logged as 4769.

**New-ADUser / Set-ADUser / Get-ADUser** — PowerShell cmdlets to create, modify, and read AD
accounts. We used them to create `svc_sql`, set it to RC4-only, and verify the result.

---

## Session log

### 2026-08-24 — Step 1: "See it before you detect it" (Kerberoasting)

**Goal:** fire Kerberoasting once, by hand, and capture the *real* Windows 4769 event in Wazuh —
before writing any detection. You can't write a rule for an event you've never looked at.

**Starting state (from our checks on the DC):**
- Domain `robslab.local` (`ROBSLAB`) is up. ✓
- Wazuh is Active and receiving. ✓
- **No roast target** — the only account with an SPN was `krbtgt` (built-in, not roastable). ✗
- **Kerberos ticket auditing = `No Auditing`** — the DC was emitting **zero** 4769 events. ✗

Two gaps to close before the attack is even observable: turn auditing on, and build a target.

**Prep 1 — turned the telemetry on** `# on: dc`
```powershell
auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable
auditpol /get /subcategory:"Kerberos Service Ticket Operations"   # want: Success
```
- *What it did:* flipped the audit subcategory that makes the DC write a 4769 for every service-
  ticket request. (see Concepts: auditpol, Event ID 4769)
- *Why:* with it off, Kerberoasting happens silently — no event, nothing for Wazuh to catch. This is
  the single most important gate in Step 1.
- *Caveat noted:* Group Policy can re-assert audit settings on refresh; since ours showed "No
  Auditing," GPO isn't enforcing it, so the setting sticks. We'll make it durable in the Default
  Domain Controllers Policy later.

**Prep 2 — built the deliberately weak roast target** `# on: dc`
```powershell
New-ADUser -Name "svc_sql" -SamAccountName "svc_sql" `
  -AccountPassword (ConvertTo-SecureString "<weak-pw see secrets/lab-fixtures.md>" -AsPlainText -Force) `
  -Enabled $true -PasswordNeverExpires $true
setspn -A MSSQLSvc/db01.robslab.local:1433 svc_sql
Set-ADUser svc_sql -Replace @{'msDS-SupportedEncryptionTypes'=4}   # RC4 only -> 0x17 tickets
```
- *What each line did:*
  - `New-ADUser` — created the service account `svc_sql` with a deliberately weak password.
  - `setspn -A` — attached the SPN, which is what makes the account *Kerberoastable*. (see Concepts:
    setspn, SPN)
  - `Set-ADUser ... msDS-SupportedEncryptionTypes=4` — forced the account onto RC4 so its tickets
    come back as `0x17`, the classic tell. (see Concepts: RC4 vs AES, msDS-SupportedEncryptionTypes)
- *Why:* you can't practice catching an attack if nothing is attackable. This account is the
  "vulnerable AD." (see Concepts: deliberately weak / roastable account)
- *Credentials:* recorded in `secrets/lab-fixtures.md` (gitignored), not here.

**Gotcha — the RC4 line failed the first time.** Running it as
`Set-ADUser svc_sql -Replace @{'msds-supportedencryptiontype'=4}` returned
*"The specified directory service attribute or value does not exist."* Cause: a one-character
typo — the attribute is `msDS-SupportedEncryptionTypes` (plural **Types**); I'd dropped the
trailing `s`. AD resolves attributes by exact name, so a misspelled attribute reads as
"doesn't exist," not "bad value." Fix: add the `s`. (Case doesn't matter; spelling does.)

**Next (pending your verification):** confirm `auditpol` shows `Success` and `setspn -L svc_sql`
shows the SPN, then fire the request (`KerberosRequestorSecurityToken` + `klist`) and hunt the 4769
in Wazuh (`data.win.system.eventID:4769`, `serviceName: svc_sql`, `ticketEncryptionType: 0x17`).
Save that raw event — it's the artifact Step 1 produces.

**What I should be able to explain after this step:** why RC4 is the tell; what turns a normal
account into a roastable one; and why "see the event first" beats copying a rule off the internet.

**Result — 2026-08-26: captured the real event. Step 1 done.**
Fired the roast on the DC (`KerberosRequestorSecurityToken` for `MSSQLSvc/db01.robslab.local:1433`)
and pulled the matching 4769 out of Wazuh. Confirmations:
- `serviceName: svc_sql` — the right target. (My first look was a `DC01$` event — background noise;
  a DC emits 4769s constantly, so the job is finding the one needle.)
- `ticketEncryptionType: 0x17` (RC4) — the tell. And `serviceSupportedEncryptionTypes: 0x4 (RC4)`
  proves the `msDS-SupportedEncryptionTypes=4` setting took.
- `status: 0x0` (success); requestor `Administrator@ROBSLAB.LOCAL`; client advertised AES but got RC4
  because the account is RC4-only.
- Raw event saved at `tests/samples/4769_kerberoast.live-capture.md`.

**Big finding (why this project exists):** the only rule that fired was **60106 "Windows Logon
Success"** (level 3, T1078 Valid Accounts). Out of the box Wazuh saw the attack as a benign login and
did **not** detect Kerberoasting. Closing that gap is Step 2 — write the detection.

**Gotcha — roasted the wrong SPN (workstation re-fire, 2026-08-26).** From the workstation I
requested `MSSQLSvc/dc01.robslab.local:1433` — `dc01`, the *DC's* hostname — instead of the
registered target `MSSQLSvc/db01.robslab.local:1433` (`db01`, svc_sql's SPN). The request still
**succeeded** (a token came back) because `dc01` resolved to the DC's computer account `DC01$`, so
the 4769 that landed showed `serviceName: DC01$` (AES `0x12`), not `svc_sql` — and my
`serviceName:svc_sql` filter showed nothing. Lessons: (1) the SPN you request decides *which* account
you roast; a wrong host silently gives you the machine account (uncrackable AES), not your target.
(2) The 4769 is logged on the **DC** (the KDC), so the workstation needs no Wazuh agent or audit
policy for this — enabling `auditpol` on the workstation does nothing for it. Fix: re-fire with the
exact `db01` SPN (verify with `setspn -L svc_sql`).

**Gotcha — must be a *domain* user to roast (2026-08-27).** Re-fired with the correct `db01` SPN but
got *"The NetworkCredentials provided were unable to create a Kerberos credential"* and `klist` showed
**0 tickets**. Cause: `whoami` read `it-rgarcia\administrator` — I was logged in as the workstation's
**local** Administrator, not a domain account. A local account never does a domain logon, so it has no
**TGT**; with no TGT you can't request *any* service ticket, so the roast can't even begin. Lesson:
Kerberoasting requires a domain-authenticated principal (a TGT in `klist`). Fix: log in as
`ROBSLAB\<user>` (verify `whoami` shows `robslab\...` and `klist` shows a `krbtgt` TGT), then re-fire.

**Off-ramp — workstation re-fire blocked by broken machine trust (2026-08-27).** Logged in as
`robslab\robert.garcia` (over SSH) with a valid TGT, but the roast still failed — both the .NET
requestor and native `klist get`. `klist get` gave the decisive error **`0xC000018B`**: *"The SAM
database on the Windows Server does not have a computer account for this workstation trust
relationship."* The workstation's machine account is missing/stale — host is `IT-RGARCIA` but the
profile is `Administrator.FINANCE-RGARCIA`, so it was almost certainly **renamed without a clean
rejoin** (no `IT-RGARCIA$` account in AD). Key insight: a *user* still gets a TGT (password AS-REQ
doesn't need machine trust), but *service-ticket* ops go through the machine's Kerberos provider and
fail when the machine itself is untrusted — hence a valid TGT that still can't roast. Decision: the
workstation re-fire was always optional and we have a clean DC capture, so we proceed to **Step 2**.
Trust repair deferred (rejoin: `Add-Computer -DomainName robslab.local -Credential ... -Force
-Restart`, then clean up the stale computer account on the DC).

### 2026-08-30 — Step 2: write the detection by hand, catch the live roast

**Goal:** write a Kerberoasting rule *from the captured event* (not copied), deploy it, and confirm it
fires on a fresh live roast. This is the **detection half of the closed loop.**

**Result — DONE.** A fresh roast now classifies as **`rule.id 100100`, `level 12`,
"Kerberoasting…", `mitre.tactic: Credential Access`, `technique: Kerberoasting`, `T1558.003`** — where
the *first* capture (2026-08-26) had been the generic level-3 `60106 "Windows Logon Success."` Same
attack, same telemetry; the only difference is our rule. **That contrast is the whole project.**

**What we built (reasoned from the 4769 fields, step by step — see the chat coaching):**
- **Sigma** — `selection`: `EventID 4769` + `TicketEncryptionType 0x17` + `Status 0x0`; `filter`:
  `ServiceName|endswith '$'` (exclude machine accounts); `condition: selection and not filter`.
- **Wazuh XML** (in `/var/ossec/etc/rules/local_rules.xml`):
```xml
<group name="windows,kerberoasting,">
  <rule id="100100" level="12">
    <if_group>windows_security</if_group>
    <field name="win.system.eventID">^4769$</field>
    <field name="win.eventdata.ticketEncryptionType">^0x17$</field>
    <field name="win.eventdata.status">^0x0$</field>
    <field name="win.eventdata.serviceName" negate="yes" type="pcre2">\$$</field>
    <description>Kerberoasting: RC4 (0x17) service ticket requested for a service account - T1558.003</description>
    <mitre>
      <id>T1558.003</id>
    </mitre>
  </rule>
</group>
```

**Deploy (by hand, no Ansible yet):** back up + edit `local_rules.xml` → validate with
`sudo /var/ossec/bin/wazuh-analysisd -t` (clean) → `sudo systemctl restart wazuh-manager`. Then
confirmed `auditpol` still `Success`, `klist purge`, re-fired the roast, and checked Discover for
`rule.id:100100`. (See Concepts: *Writing Wazuh detection rules*.)

**Traps caught along the way (report + interview gold — every one was a real mistake we fixed):**
- **contains vs endswith** — `contains '$'` over-excludes: a legit account named `svc$x` would be
  suppressed, so a real roast of it would go undetected = a false *negative* (the worst kind).
  `endswith '$'` is the correct machine-account reduction.
- **ticket vs session-key encryption type** — the rule must match the **Ticket** Encryption Type (the
  crackable tell), not the Session Key type. First XML draft grabbed the wrong one; both were `0x17`
  here so it would have "worked" by luck — wrong signature, right answer, still a bug.
- **OS_Regex vs PCRE2** — a literal `$` is unreliable in Wazuh's default OS_Regex. Without
  `type="pcre2"` the `\$$` match no-ops, and `negate="yes"` over a never-matching field is *always
  true* → the machine-account filter silently does nothing. `type="pcre2"` makes `\$$`
  (escaped-dollar + end-anchor) behave.
- **anchoring** — `^4769$`, not `4769`, so it can't also match `47690`.
- **drop the `data.` prefix** — the indexer shows `data.win.eventdata.X`; the *rule* writes
  `win.eventdata.X`.
- **the `pcr2` typo** — one dropped letter (`pcr2` → `pcre2`); `wazuh-analysisd -t` is exactly what
  catches it before a bad reload. Same lesson as the `msDS` typo in Step 1: spelling, not meaning.
- **Wazuh SID ≠ Windows SID** — the rule `id` (`100100`) has nothing to do with the `S-1-5-21-…`
  security identifier in the event.
- **no retroactive re-classification** — Wazuh tags events *as they arrive*; the old 60106 capture
  stays 60106 forever. You must fire a **fresh** roast after deploying to see the new rule fire.
- **Kerberos caching** — `klist purge` before re-firing, or a cached ticket means no new KDC request
  and therefore no new 4769.

**Bonus artifact:** the alert's **`full_log`** field is the raw `{"win":{…}}` event — exactly the input
`wazuh-logtest` consumes. That's our repeatable **unit-test fixture**: we can test rule tweaks against
it without re-firing the attack. (LEARNING_PLAN's two-tier test: this is the `/logtest` unit side; the
Discover confirmation above is the indexer integration side.)

**What I can now explain (Phase 4 "done when"):** every field and every reduction in *my* rule, why RC4
is the tell, why the machine-account exclusion needs `endswith`+`pcre2`, and why the same event went
from "benign login" to "Kerberoasting." ✓

### 2026-09-02 — Step 2b: deploy live, and the structure that wouldn't fire

**Goal:** deploy the rule to the live manager and confirm a real roast fires it — the *integration*
half of the two-tier test.

**Result — WORKING, after a real fight.** A live roast now fires **`rule.id 100201` (level 12)**. But
getting there exposed a genuine flaw in the pre-authored design.

**The bug: the reference's `parent/child + <decoded_as>` structure does NOT fire on this manager.**
The reference (and my first canonical version) used a level-0 "sighting" parent
(`<decoded_as>windows_eventchannel</decoded_as>`, id `100200`) + a level-12 child
(`<if_sid>100200</if_sid>`, id `100201`). Deployed live, a real roast kept matching the **generic base
rule `60106` "Windows Logon Success" (level 3)** instead of `100201` — the custom rule never won.
Swapping the parent's `<decoded_as>` for `<if_group>windows_security</if_group>` did **not** fix it;
the parent/child split itself was the problem.

**The fix: a SINGLE rule chained via `<if_group>windows_security</if_group>`** — exactly the shape of
the first working version (old id `100100`). It fires `100201` at level 12, verified against a live
roast. Collapsing the parent/child back into one rule was the whole fix.

**Why this matters (the thesis, proven the hard way):** the pre-authored layer *passed every offline
test* (`pytest ci/test_offline.py` = 30 green) yet **did not fire live.** The offline model checks
whether fields match; it does not model how a custom rule competes with the base ruleset. Per the
README the detection layer was authored but never live-tested — so this flaw sat undiscovered until the
integration test. **This is exactly why the two-tier test exists: offline green is necessary, not
sufficient.** (Custom rules generally must chain onto the base ruleset via `if_sid`/`if_group` to
override it — a known Wazuh behaviour, not a novel discovery, but a real gap in *this* repo.)

**Debugging trail (for the report):**
- The roast *was* being logged (4769 present, `auditpol` still `Success`) — it just matched `60106`,
  not `100201`. Telemetry fine; rule not winning.
- `wazuh-logtest` on a hand-pasted JSON event decoded via the generic **`json`** decoder, not
  **`windows_eventchannel`** — a logtest artifact (pasted JSON ≠ agent-delivered eventchannel). Don't
  trust hand-fed logtest for eventchannel `decoded_as` behaviour.
- Decisive evidence was the **control experiment**: v1 (single rule + `if_group`) fired; v2
  (parent/child) did not — *same fields*, so the structure was the only variable.
- Fastest live confirmation: `tail -f /var/ossec/logs/alerts/alerts.log` while firing — the alert and
  its `rule.id` appear the instant the event lands, with no Discover/time-range/index noise.

**Also relearned:** the `4769` audit subcategory ("Kerberos Service Ticket Operations") is separate
from Logon/Logoff — seeing `4624`/`4634` but no `4769` means the Kerberos switch flipped off
(GPO/reboot). And `klist` (list) ≠ `klist purge`; only **purge** forces a fresh KDC request → a new
`4769`.

**Canonical rule is now the single-rule design** in `rules/wazuh/local_rules.xml`; the pre-authored
parent/child version is preserved (as the non-firing answer key) in `reference/`. Offline suite still
30/30 green. **Step 2 — detection engineering + live verification — is DONE.**

### 2026-10-05 — Repo cleanup: make the repo match what's actually built

**Goal:** stop getting lost in the repo. A lot of it was pre-generated scaffolding (AS-REP, DCSync,
PtH, heatmap) that hadn't been worked through yet, mixed in with the Kerberoasting work that had.

**What we did** `# on: windows clone`
- Branch `cleanup`: moved everything not yet built into `_later/` (see `_later/README.md` for what
  each piece is and how to bring it back). Nothing deleted — `git mv` keeps history.
- Trimmed `tests/samples/manifest.json` to the one live-verified case (kerberoasting); the other three
  cases are parked in `_later/tests/samples/manifest.parked.json`.
- Three negative tests that loaded the parked samples moved to `_later/ci/parked_negative_tests.py`.
  Offline suite: **12/12 green** (was 30 — fewer cases, not fewer checks per case).
- The CI `heatmap` job is commented out until `heatmap/` comes back.
- Merged to `main` (`e6ee52b`). Note: the 09-02 entry's `reference/` is now `_later/reference/`.

**Playbook check** `# on: netAdmin`
- `ansible-playbook --syntax-check deploy-rule.yml` — parses the YAML without touching any host.
  Passed. The warnings were all one cause: no `inventory.ini` next to `ansible.cfg`.
- `inventory.ini` is gitignored on purpose (real IPs + SSH user), so a fresh clone never has it.
  Moved it into `ansible/` — `ansible.cfg`'s `inventory = inventory.ini` is resolved relative to the
  cfg's own directory, and Ansible only reads an `ansible.cfg` in the directory you run from.

**Git topology, written down because it caused confusion:**
- Windows clone → `origin` (GitHub) only.
- netAdmin clone `~/SeniorProject` → `origin` (GitHub) **and** `gitea` (`localhost:3000`). This is the
  hub: pull from GitHub, push to Gitea. **A push to Gitea is what triggers CI.**
- netAdmin's DNS is intermittent — `Could not resolve hostname ssh.github.com` broke a pull.

### 2026-10-07 — Phase 6: first CI runs, and `validate` goes GREEN

**Goal:** get the cheapest CI job — `validate` (Sigma lint + offline tests, Linux runner, no lab) —
green in Gitea.

**Housekeeping first** `# on: netAdmin`
- **Reset the runner registration token** (Site Administration → Actions → Runners → Create new
  Runner → Reset). It had been pasted into chat twice. Resetting does **not** break the registered
  runner: the registration token is a one-time join code; after registering, the runner authenticates
  with its own runner token stored in `~/.runner/.runner`.
- **Forgot the Gitadmin password** — reset from the CLI:
  `sudo -u git gitea admin user change-password --username Gitadmin --password ... --config
  /etc/gitea/app.ini --work-path /var/lib/gitea`. Runs as `git` (not root) so it doesn't leave
  root-owned files in Gitea's data dir; it can read `app.ini` because that file is `640 root:git`.
- **Gotcha:** `git push` then failed with `remote: Update your password`. The CLI reset sets a
  *must-change-password* flag, and Gitea refuses git-over-HTTP until it's cleared (log in on the web
  and change it, or re-run with `--must-change-password=false`).

**First runs — three failures, each one layer deeper** (the runner is `linux:host` = host mode: jobs
run directly on netAdmin, so every tool a job uses must be installed there)
1. `actions/checkout@v4` → **`Cannot find: node in PATH`.** Checkout is a JavaScript action; in host
   mode there's no container bringing Node along. Fix: `sudo apt install nodejs`.
2. `Install tooling` → **`/usr/bin/python: No module named pip`.** Ubuntu ships pip separately, and
   newer Ubuntu also blocks system-wide `pip install` (PEP 668, "externally-managed-environment").
   Fix: `sudo apt install python3-venv`, and the step now builds a venv:
   ```yaml
   python3 -m venv .venv
   .venv/bin/pip install --upgrade pip
   .venv/bin/pip install -r ci/requirements.txt
   .venv/bin/pip install sigma-cli pysigma-validators-sigmahq
   echo "$PWD/.venv/bin" >> "$GITHUB_PATH"
   ```
   *Why the last line:* every `run:` step is a fresh shell, so `source activate` wouldn't survive to the
   next step. Appending to `$GITHUB_PATH` puts `.venv/bin` on PATH for all later steps, so `sigma` and
   `pytest` resolve to the venv's copies.
3. Checkout again → **`lookup github.com on 127.0.0.53:53 ... i/o timeout`.** netAdmin's DNS
   (systemd-resolved) dropped out again; the runner re-fetches `actions/checkout` from GitHub every run.

**Result — `validate` GREEN.** First successful CI run: push → Gitea → runner → lint → 12 tests → pass.

**Known limitation (for the report):** the lab is meant to be isolated, but `validate` needs the
internet twice — `actions/checkout` from GitHub and packages from PyPI. Future fix: mirror
`actions/checkout` into Gitea and cache the Python packages.

### 2026-10-12 — Fire the real Atomic Red Team test: the stock test misses, test #5 hits

**Goal:** atomics had never actually run in this lab (the 08-30 roast was a hand-rolled .NET call).
Before CI fires one automatically, fire it by hand and confirm rule `100201`.

**Prep** `# on: dc, workstation`
- **Audit policy moved to GPO.** The DC's Kerberos auditing was a hand-run `auditpol`, which had
  flipped off once before (09-02). Now set in **Default Domain Controllers Policy → Advanced Audit
  Policy**: Kerberos Service Ticket Operations (4769), Kerberos Authentication Service (4768),
  Directory Service Access (4662), Logon (4624) — all Success — plus *"Audit: Force audit policy
  subcategory settings"* = Enabled. *Catch:* once a GPO defines any advanced subcategory it
  **replaces** the local audit config, so everything needed later is in the GPO now.
  The workstation needs **no** auditing for Kerberoasting — the 4769 is written by the DC (the KDC).
- Installed Atomic Red Team on `IT-RGARCIA` (`C:\AtomicRedTeam`); fired as `robslab\robert.garcia`.

**Attempt 1 — test #4 "Request A Single Ticket via PowerShell": no alert, and that's correct.**
`-ShowDetails` shows the SPN it requests:
```powershell
$ComputerFQDN = $env:LogonServer.trimStart('\') + "." + $env:UserDnsDomain
New-Object System.IdentityModel.Tokens.KerberosRequestorSecurityToken -ArgumentList "HTTP/$ComputerFQDN"
```
`$env:LogonServer` is the DC, so this asks for `HTTP/DC01.robslab.local` → a ticket for the **DC's
machine account `DC01$`**, AES `0x12`. The rule deliberately ignores machine accounts and only matches
RC4 `0x17`, so it stays quiet — correctly. Test #4 has no input arguments, so it can't be pointed at
`svc_sql`. **`manifest.json` pinned CI to this test — it could never have passed.**

**Detours (for the report):**
- `Found 0 atomic tests applicable` — typo, `T1550.003` (Pass the Ticket) instead of `T1558.003`.
- Dashboard query `ticketEncryptionType: 17` found nothing — the field is the **string** `"0x17"`.
- The first 4769s found were **the DC's own background traffic**, not the attack: `targetUserName:
  DC01$`, `ipAddress: ::1`, service `DC01$`/`krbtgt`. The stock rule labels every one of them `60106`
  "Windows Logon Success" (`firedtimes` ~100) — the noise this project's rule exists to cut through.
- Wazuh logged the investigation itself: the `sudo grep` on `alerts.json` raised rule `5402`
  "Successful sudo to ROOT".

**Attempt 2 — test #5 "Request All Tickets via PowerShell": DETECTED.**
Test #5 runs `setspn -T $env:USERDNSDOMAIN -Q */*` and requests a ticket for **every** SPN in the domain.
```powershell
klist purge
Invoke-AtomicTest T1558.003 -TestNumbers 5
```
Result — **`rule.id 100201`, level 12**, "Kerberoasting: RC4-HMAC service ticket requested for SPN
svc_sql by robert.garcia@ROBSLAB.LOCAL", MITRE T1558.003 / Credential Access:
- `serviceName: svc_sql`, `ticketEncryptionType: 0x17`, `serviceSupportedEncryptionTypes: 0x4 (RC4)`
- requester `robert.garcia@ROBSLAB.LOCAL` from `10.20.0.101` (workstation subnet; DC is `10.10.0.100`)
- **`firedtimes: 1`** — the test requested tickets for every SPN, and the rule fired **once**, on the
  only roastable one. Detects the real target, ignores the machine-account noise in the same burst.

**Takeaway:** the stock ART Kerberoasting test (#4) does not exercise a correctly tuned detection —
validate the *attack tooling*, not just the rule. Kerberoasting is now proven against a standard
attack tool, not just a hand-rolled request.

**To do:** switch the manifest's kerberoasting atomic from `[4]` to `[5]`; register the Windows
runner on `IT-RGARCIA` (label `windows`); add Gitea secrets/vars; run `detect` end to end.

### 2026-10-12 (cont.) – 10-14 — Windows runner up; `detect` reaches the manager; unit test blocked on the decoder

**Goal:** get the `detect` job (runs on the Windows workstation) running end to end in CI.

**Done:**
- **Manifest pinned to ART test 5** (`fb8b726`).
- **Windows runner registered** `# on: workstation` — downloaded act_runner 0.2.11 (windows-amd64) to
  `C:\act_runner\act_runner.exe`, registered `--name it-rgarcia --labels windows:host` against Gitea
  at `http://10.60.0.100:3000`, running with `.\act_runner.exe daemon` in a console as
  `robslab\robert.garcia`. Gitea picks up `detect` jobs: checkout, Node, Git, Python, pwsh all OK.
- **Why a console, not a Windows service:** a service runs as LocalSystem, so the atomic would request
  tickets as `IT-RGARCIA$@ROBSLAB.LOCAL` — and rule `100201` drops requesters ending in `$@` (it's
  there to cut machine-account noise). **Limitation for the report:** roasting from a SYSTEM shell
  (machine account), or from a user account deliberately named like `backup$`, is not detected.
- **First `detect` run:** `[FATAL] No manager password set`. The API user is `wazuh-wui` (password
  from the dashboard's `wazuh.yml` / `wazuh-install-files.tar`) — *not* the dashboard login, which is
  the indexer `admin`. Added to Gitea repo Settings → Actions → Secrets/Variables. After that the
  logtest session initializes, so the manager API credentials work.
- **Found:** the Wazuh indexer only listens on `127.0.0.1:9200` (secure default), so the workstation
  can't reach it for the integration test. Plan: `network.host: ["127.0.0.1", "<wazuh-ip>"]` in
  `/etc/wazuh-indexer/opensearch.yml`, firewall 9200 open **only** to `10.20.0.101`, check with
  `Test-NetConnection` from the workstation. **Status: not confirmed done.**

**The blocker — unit test fails with the wrong decoder.**
```
[FAIL]  kerberoasting    expected rule.id 100201, got 1002
           decoder: json
           matched: Unknown problem somewhere in the system. groups=['syslog', 'errors']
```
(The `decoder:` / `matched:` lines were added to `ci/logtest_unit.py` in `fb8b726` to see this.)
**Why it fails:** `/logtest` decoded the sample with the generic **`json`** decoder, not
**`windows_eventchannel`** (which the live alerts show). Only events from the eventchannel decoder go
through the base Windows rules that add the `windows_security` group, and `100201` hangs off
`if_group windows_security` — so it's never even evaluated. `1002` fires on the word "Failure" in the
message text. **The rule is fine** (it fired live on 10-12); the problem is how the unit test hands the
event to logtest. Same artifact the 09-02 entry warned about.

**Experiment (10-14)** `# on: wazuh manager (splunk), via ssh from netAdmin` — sent the sample to
`/logtest` with each `log_format`:
```
== windows_eventchannel decoder: json rule: 1002
== eventchannel decoder: json rule: 1002
== json decoder: json rule: 1002
```
**Proven: `/logtest` cannot run a pasted Windows event through `windows_eventchannel`, whatever
`log_format` is sent.** A real agent marks its events as eventchannel on the way in; a pasted event
has no such marker, so the generic `json` decoder claims it. Logtest can unit-test syslog-style
rules, but **not** rules chained on the Windows decoder, which is all of this project's rules.
(The 09-02 suspicion, now confirmed three ways.)

*Detours:* netAdmin → `10.50.0.110:55000` **times out** (inter-subnet firewall; left closed — CI only
needs the workstation to reach it). Ran the test on the manager itself against `127.0.0.1:55000`.
An empty `$TOKEN` (length 0) meant "no connection", not "wrong password" — a wrong password
still returns a JSON error.

**Decision: the CI unit step becomes a pre-flight check.** New `ci/rule_loaded.py` asks the manager
`GET /rules?rule_ids=100201` and fails the build if the rule isn't loaded (never deployed, or the XML
failed to parse). It proves the manager is reachable, the CI credentials work, and the rule is live —
fast, before firing anything. It does **not** prove the rule matches; the live atomic plus the indexer
search (`confirm_alert.py`) is the only real proof for Windows rules. `detect` and the `deploy` job's
post-deploy check both use it now. `logtest_unit.py` stays in the repo but is out of CI.
**For the report:** the planned "unit tier" (`/logtest`) turned out impossible for eventchannel rules.
That's a tooling limitation found by testing, and it makes the integration test the real gate.

**Getting `detect` through on the Windows runner (10-14):**
- `detect` sat on **Waiting** — the runner is a console process, and its window had been closed.
  Restarted `.\act_runner.exe daemon`. (A real deployment would make it a service under a domain
  user, not LocalSystem; see the machine-account note above.)
- `Cannot find: pwsh in PATH` — the steps use `shell: pwsh` (PowerShell 7); Windows only ships
  5.1 (`powershell.exe`). Installed PowerShell 7, restarted the runner in a new window to pick up PATH.
- `The required module 'powershell-yaml' is not loaded` — ART's dependency was installed for 5.1's
  per-user module folder, which pwsh 7 doesn't search. Fix: `Install-Module powershell-yaml -Scope
  AllUsers` from an admin pwsh (→ `C:\Program Files\PowerShell\Modules`), and start the runner from
  pwsh rather than 5.1 so it inherits pwsh's module path.
- After that the run reached **`deploy`**, which only runs once `detect` passes →
  **`detect` appears GREEN: pre-flight, live atomic, and indexer confirmation of `100201`.**
  *(To confirm: read the integration step's final line in the run log.)*

**`deploy` job — first ever run, four problems:**
`ERROR! Invalid vault password was provided from file .../ansible/.vault_pass`. Nothing in the repo
is vaulted, and the `ANSIBLE_VAULT_PASS` secret was never set, so an empty password file was passed.
Reading the job turned up three more: `ansible.cfg` isn't read when running from the repo root (so
`remote_user`/key/become were ignored), the post-deploy `pip install` would hit PEP 668 on the host,
and `ANSIBLE_INVENTORY` (the inventory secret) probably isn't set. Fixed the first three in `detect.yml`
(dropped vault, `ANSIBLE_CONFIG=ansible/ansible.cfg`, venv).

**MILESTONE — `detect` GREEN in CI (run on `a618d08`, 2026-10-14):** pre-flight passed, the atomic
fired on `IT-RGARCIA`, and `confirm_alert.py` printed
`[PASS] Found 1 alert(s) for rule.id=100201 / T1558.003. Most recent 2026-10-14T20:31:36.511+0000:
Kerberoasting: RC4-HMAC service ticket requested for SPN svc_sql by robert.garcia@ROBSLAB.LOCAL`.
**A push now fires a real Kerberoasting attack and the build only passes if Wazuh caught it.**
Midterm target met.

`deploy` (same run) then **hung 8+ minutes** on the first task, `Copy local_rules.xml to the manager`
— Ansible waiting on a prompt CI can't answer (SSH key passphrase, or sudo password for `become`).
Cancelled. Test: `ssh -i ~/.ssh/ansible_ed25519 -o BatchMode=yes robert@10.50.0.110 'sudo -n true'`
→ `Permission denied (publickey,password)`. `ssh -v` showed the manager accepts only the personal
key `id_ed25519`; the dedicated `ansible_ed25519` key (set in `ansible.cfg`) was never authorized
there, so SSH fell back to a password prompt and Ansible waited forever. Fix: `ssh-copy-id -i
~/.ssh/ansible_ed25519.pub robert@10.50.0.110` (keep a separate automation key; don't reuse the
personal one). Also made CI fail fast instead of hang: `ANSIBLE_SSH_ARGS=-o BatchMode=yes` and
`timeout-minutes: 10` on the deploy step.

**Pick up here:**
1. Find which prompt `deploy` hangs on (the BatchMode test above) and fix it without weakening more
   than needed.
2. (`ANSIBLE_INVENTORY` secret is set — the play started.) If it's sudo: decide between a vaulted
   `ansible_become_password` and a limited NOPASSWD sudo rule for the deploy user. Then `deploy` green.

**Still denied after `ssh-copy-id` ("keys already exist").** The public key *was* on the manager;
`ssh-keygen -y -P "" -f ~/.ssh/ansible_ed25519` → `incorrect passphrase supplied` — **the Ansible key
has a passphrase**, which CI can't type (BatchMode skips the key → denied). Decision: a **separate CI
deploy key** `~/.ssh/ci_deploy_ed25519` (no passphrase), authorized on the manager with
`from="10.60.0.100"` so it only works from netAdmin; the personal `ansible_ed25519` keeps its
passphrase for manual runs. CI selects it via `ANSIBLE_PRIVATE_KEY_FILE` in the deploy step.
**For the report:** unattended automation needs an unattended credential — compensate for the
missing passphrase by scoping it (source IP, one user, file perms 600, one purpose).

**Next blocker: `sudo: a password is required`** (CI key logs in fine). Learned: a "narrow" NOPASSWD
sudo rule doesn't work with Ansible — `become` runs `sudo /bin/sh -c '... python3 /tmp/<module>'`,
so the rule must allow a shell/Python, i.e. full root anyway. Real choice was whether that root still
needs a secret. **Decision: Ansible Vault.** `ansible_become_password` encrypted (AES256) in
`ansible/group_vars/wazuh_manager/vault.yml` (committed — it's ciphertext); the vault password is a
random 32-byte string in `~/.ansible_vault_pass` (mode 600) on netAdmin, next to the SSH key, never in
git. CI passes it with `--vault-password-file`.

Manual dry run still asked for the **`ansible_ed25519` passphrase**: `ANSIBLE_PRIVATE_KEY_FILE` was
ignored because the key set in the inventory outranks env/config. Fix: pass the CI key as an extra var,
`-e ansible_ssh_private_key_file=~/.ssh/ci_deploy_ed25519` (extra vars beat everything). CI updated.
