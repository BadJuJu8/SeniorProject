<#
.SYNOPSIS
    Fire an Atomic Red Team test on the local Windows target and print the UTC
    start time so the integration test can scope its indexer query.

.DESCRIPTION
    Runs on the Gitea Act runner that lives ON the Windows target (see docs/PLAN.md),
    so there is no remoting. It resolves which atomic to run from the technique key
    (or an explicit ATT&CK id), optionally installs prerequisites, executes the test,
    and can clean up afterwards.

    SAFETY: this only invokes Atomic Red Team test cases against the machine it runs
    on, inside the isolated lab VLAN, to prove detections fire. It is not offensive
    tooling and must not be pointed at anything the operator does not own.

.PARAMETER Technique
    A manifest technique key (kerberoasting, asrep_roasting, dcsync, pass_the_hash)
    or an ATT&CK id like T1558.003.

.PARAMETER TestNumbers
    Atomic test numbers to run. If omitted, taken from tests/samples/manifest.json.

.PARAMETER GetPrereqs
    Install test prerequisites first (Invoke-AtomicTest -GetPrereqs).

.PARAMETER Cleanup
    Run the atomic's cleanup commands after execution.

.PARAMETER StartTimeFile
    Optional path to also write the UTC ISO8601 start time to (for the pipeline).

.EXAMPLE
    pwsh ci/fire_atomic.ps1 -Technique kerberoasting -GetPrereqs
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Technique,
    [int[]] $TestNumbers,
    [switch] $GetPrereqs,
    [switch] $Cleanup,
    [string] $StartTimeFile
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'tests/samples/manifest.json'

function Resolve-Atomic {
    param([string] $Key)
    if ($Key -match '^T\d{4}(\.\d{3})?$') {
        return @{ AttackId = $Key; TestNumbers = $TestNumbers }
    }
    if (-not (Test-Path $manifestPath)) {
        throw "Manifest not found at $manifestPath and '$Key' is not an ATT&CK id."
    }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $case = $manifest.cases | Where-Object { $_.technique -eq $Key }
    if (-not $case) { throw "No manifest case for technique '$Key'." }
    $nums = if ($TestNumbers) { $TestNumbers } else { $case.atomic.test_numbers }
    return @{ AttackId = $case.attack_id; TestNumbers = $nums }
}

if (-not (Get-Module -ListAvailable -Name 'Invoke-AtomicRedTeam')) {
    throw "Invoke-AtomicRedTeam is not installed. See docs/RUNBOOK.md (Phase 5) for setup."
}
Import-Module Invoke-AtomicRedTeam -ErrorAction Stop

$resolved = Resolve-Atomic -Key $Technique
$attackId = $resolved.AttackId
$nums = $resolved.TestNumbers
if (-not $nums) { throw "No test numbers resolved for '$Technique'." }

# Emit the start time BEFORE firing so the integration query never misses the alert.
$startUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
Write-Host "ATOMIC_START_UTC=$startUtc"
if ($StartTimeFile) { Set-Content -Path $StartTimeFile -Value $startUtc -Encoding ascii }

Write-Host "Technique : $attackId"
Write-Host "Tests     : $($nums -join ', ')"

if ($GetPrereqs) {
    Write-Host "--- Installing prerequisites ---"
    Invoke-AtomicTest $attackId -TestNumbers $nums -GetPrereqs
}

Write-Host "--- Firing atomic ---"
Invoke-AtomicTest $attackId -TestNumbers $nums

if ($Cleanup) {
    Write-Host "--- Cleanup ---"
    Invoke-AtomicTest $attackId -TestNumbers $nums -Cleanup
}

Write-Host "Done. Confirm the detection with:"
Write-Host "  python ci/confirm_alert.py --attack-id $attackId --since $startUtc --timeout 180"
