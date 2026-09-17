# Thin wrapper: playable work is on main. Prefer scripts/local-play.ps1.
param(
	[switch]$PlayMap
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Write-Host "Playable work is on origin/main. Syncing main and rebuilding Nakama."
Invoke-RepoScript "local-play.ps1" -ArgumentList @("-Branch", "main")
if ($PlayMap) {
	Invoke-RepoScript "review-village-map.ps1"
}
