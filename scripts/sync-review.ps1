# Pull the current cloud-agent review branch onto this machine.
# Work is not on main. Run after every agent prompt, with Godot closed.
param(
	[switch]$PlayMap,
	[switch]$RestartBackend
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot

$branchFile = Join-Path $RepoRoot "docs\AGENT_REVIEW_BRANCH"
if (-not (Test-Path $branchFile)) {
	throw "docs/AGENT_REVIEW_BRANCH is missing. Agent work is not on main; that file names the branch to pull."
}
$branch = (Get-Content $branchFile -Raw).Trim()
if ($branch -notmatch "^[\w./-]+$" -or $branch.Length -lt 3) {
	throw "docs/AGENT_REVIEW_BRANCH has an invalid branch name: '$branch'"
}

$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) {
	throw "git status failed. Run this from C:\Users\Eszter\small-mmorpg."
}
if ($dirty) {
	Write-Host "Working tree has local changes. Commit, stash, or discard them before pulling:"
	git status
	throw "Refusing to pull onto a dirty tree. Typical Godot noise: git restore ."
}

Write-Host "Fetching origin/$branch ..."
git fetch origin $branch
if ($LASTEXITCODE -ne 0) {
	throw "git fetch failed for origin/$branch"
}

git checkout $branch
if ($LASTEXITCODE -ne 0) {
	throw "git checkout $branch failed"
}

git pull --ff-only origin $branch
if ($LASTEXITCODE -ne 0) {
	throw "git pull --ff-only origin/$branch failed"
}

$head = (git rev-parse --short HEAD).Trim()
$full = (git rev-parse HEAD).Trim()
Write-Host ""
Write-Host "Synced $branch @ $head"
Write-Host "commit $full"
Assert-ContentHashes
Write-Host ""
Write-Host "NEXT (Godot must be fully quit first):"
Write-Host "  Map only, no server:  powershell -File scripts/review-village-map.ps1"
Write-Host "  Live Alice:           powershell -File scripts/dev-up.ps1"
Write-Host "                        powershell -File scripts/run-client.ps1 -DevUser alice"
Write-Host "Do not review from main. world.tscn in the editor is empty until Play."

if ($RestartBackend) {
	Invoke-RepoScript "dev-up.ps1"
}
if ($PlayMap) {
	Invoke-RepoScript "review-village-map.ps1"
}
