# Build the runtime bundle, recreate Nakama so it loads that bundle, then verify RPCs.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$server = Join-Path $RepoRoot "server"
$infra = Join-Path $RepoRoot "infra"
if (-not (Test-Path (Join-Path $server "node_modules"))) {
	Invoke-Native -FilePath "npm" -ArgumentList @("ci") -WorkingDirectory $server -FailMessage "server npm ci failed"
}
Invoke-Native -FilePath "npm" -ArgumentList @("run", "build") -WorkingDirectory $server -FailMessage "server build failed"
Invoke-Native -FilePath "docker" -ArgumentList @("compose", "up", "--build", "-d", "--force-recreate") -WorkingDirectory $infra -FailMessage "docker compose up failed"
Invoke-Native -FilePath "docker" -ArgumentList @("compose", "ps") -WorkingDirectory $infra -FailMessage "docker compose ps failed"
Invoke-RepoScript "backend-verify.ps1"
