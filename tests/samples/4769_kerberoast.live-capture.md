# Live capture — Kerberoasting 4769 (svc_sql), RC4 / 0x17

Captured 2026-08-26 (event UTC `2026-08-27T04:45:28Z`) from the Wazuh indexer after firing a
Kerberoast request **by hand** on the DC:
`New-Object System.IdentityModel.Tokens.KerberosRequestorSecurityToken "MSSQLSvc/db01.robslab.local:1433"`.

This is the **Step 1 artifact: the real event**, not a hand-written fixture. Do not confuse it with
the pre-authored fixture `4769_kerberoast.json` — per the learning plan, the real telemetry is what
we build the detection from.

## Fields that matter

| Field | Value | Meaning |
|-------|-------|---------|
| `data.win.system.eventID` | `4769` | A Kerberos service ticket was requested |
| `data.win.eventdata.serviceName` | `svc_sql` | the roast target (account owning the SPN) |
| `data.win.eventdata.ticketEncryptionType` | `0x17` | **RC4 — the Kerberoasting tell** (ticket encrypted with svc_sql's key) |
| `data.win.eventdata.sessionKeyEncryptionType` | `0x17` | session-key cipher (secondary; RC4 here too) |
| `data.win.eventdata.serviceSupportedEncryptionTypes` | `0x4 (RC4)` | proves `msDS-SupportedEncryptionTypes=4` took |
| `data.win.eventdata.targetUserName` | `Administrator@ROBSLAB.LOCAL` | who requested the ticket |
| `data.win.eventdata.status` | `0x0` | success |
| `data.win.eventdata.clientAdvertizedEncryptionTypes` | AES256, AES128, RC4… | client offered AES but got RC4 (account is RC4-only) |

## The finding that justifies the project

The only Wazuh rule that fired was **`rule.id 60106` — "Windows Logon Success"** (level 3), mapped to
**T1078 Valid Accounts**: a generic benign-login rule. Out of the box, Wazuh did **not** recognize
this as Kerberoasting (T1558.003). Closing that gap is the detection we write next.

## Raw event (as pasted from Wazuh Discover)

```
input.type:log agent.ip:10.10.0.100 agent.name:Domain_Controller agent.id:002 manager.name:splunk data.win.eventdata.sessionKeyEncryptionType:0x17 data.win.eventdata.ipAddress:::1 data.win.eventdata.accountAvailableKeys:N/A data.win.eventdata.requestTicketHash:9EoCEuuH3oAxd/XmZjCbtAKwbGOjsdCXRpLf2cWwrOs= data.win.eventdata.serviceSid:S-1-5-21-2123761621-2406272507-1329795698-1207 data.win.eventdata.serviceName:svc_sql data.win.eventdata.responseTicketHash:mQKD61g5B8BY2Tsr8c+Rj7KgSVrogFW9Xu1CYNlcVak= data.win.eventdata.dCSupportedEncryptionTypes:0x1F (DES, RC4, AES128-SHA96, AES256-SHA96) data.win.eventdata.logonGuid:{0b5a8da4-c2d2-0059-abaf-10d8dfc3954d} data.win.eventdata.targetUserName:Administrator@ROBSLAB.LOCAL data.win.eventdata.ticketOptions:0x40810000 data.win.eventdata.accountSupportedEncryptionTypes:N/A data.win.eventdata.ipPort:0 data.win.eventdata.serviceAvailableKeys:AES-SHA1, RC4 data.win.eventdata.clientAdvertizedEncryptionTypes: AES256-CTS-HMAC-SHA1-96 AES128-CTS-HMAC-SHA1-96 RC4-HMAC-NT RC4-HMAC-NT-EXP RC4-HMAC-OLD-EXP data.win.eventdata.targetDomainName:ROBSLAB.LOCAL data.win.eventdata.serviceSupportedEncryptionTypes:0x4 (RC4) data.win.eventdata.ticketEncryptionType:0x17 data.win.eventdata.status:0x0 data.win.eventdata.dCAvailableKeys:AES-SHA1, RC4 data.win.system.eventID:4769 data.win.system.keywords:0x8020000000000000 data.win.system.providerGuid:{54849625-5478-4994-a5ba-3e3b0328c30d} data.win.system.level:0 data.win.system.channel:Security data.win.system.opcode:0 data.win.system.message:"A Kerberos service ticket was requested. Account Information: Account Name: Administrator@ROBSLAB.LOCAL Account Domain: ROBSLAB.LOCAL Logon GUID: {0b5a8da4-c2d2-0059-abaf-10d8dfc3954d} MSDS-SupportedEncryptionTypes: N/A Available Keys: N/A Service Information: Service Name: svc_sql Service ID: S-1-5-21-2123761621-2406272507-1329795698-1207 MSDS-SupportedEncryptionTypes: 0x4 (RC4) Available Keys: AES-SHA1, RC4 Domain Controller Information: MSDS-SupportedEncryptionTypes: 0x1F (DES, RC4, AES128-SHA96, AES256-SHA96) Available Keys: AES-SHA1, RC4 Network Information: Client Address: ::1 Client Port: 0 Advertized Etypes: AES256-CTS-HMAC-SHA1-96 AES128-CTS-HMAC-SHA1-96 RC4-HMAC-NT RC4-HMAC-NT-EXP RC4-HMAC-OLD-EXP Additional Information: Ticket Options: 0x40810000 Ticket Encryption Type: 0x17 Session Encryption Type: 0x17 Failure Code: 0x0 Transited Services: - Ticket information Request ticket hash: 9EoCEuuH3oAxd/XmZjCbtAKwbGOjsdCXRpLf2cWwrOs= Response ticket hash: mQKD61g5B8BY2Tsr8c+Rj7KgSVrogFW9Xu1CYNlcVak= ..."
data.win.system.version:2 data.win.system.systemTime:2026-08-27T04:45:28.613486600Z data.win.system.eventRecordID:344751 data.win.system.computer:DC01.robslab.local data.win.system.severityValue:AUDIT_SUCCESS data.win.system.providerName:Microsoft-Windows-Security-Auditing rule.level:3 rule.description:Windows Logon Success rule.groups:windows, windows_security, authentication_success rule.mitre.technique:Valid Accounts rule.mitre.id:T1078 rule.id:60106 location:EventChannel decoder.name:windows_eventchannel _index:wazuh-alerts-4.x-2026.08.27
```
