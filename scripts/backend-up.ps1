# Build the runtime bundle, recreate Nakama so it loads that bundle, then verify RPCs.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$server = Join-Path $RepoRoot "server"
$infra = Join-Path $RepoRoot "infra"
$envLocal = Join-Path $infra ".env.local"
if (-not (Test-Path $envLocal)) {
	throw "Missing infra/.env.local. Copy infra/.env.local.example, set SENDGRID_API_KEY and a SendGrid-verified EMAIL_FROM, then retry."
}
function Get-DotEnvValue([string]$Path, [string]$Name) {
	foreach ($line in Get-Content -Path $Path) {
		if ($line -match ("^\s*" + [regex]::Escape($Name) + "=(.*)$")) {
			return $Matches[1].Trim().Trim('"').Trim("'")
		}
	}
	return ""
}
$sendgridKey = Get-DotEnvValue $envLocal "SENDGRID_API_KEY"
$emailFrom = Get-DotEnvValue $envLocal "EMAIL_FROM"
if ($sendgridKey.Length -lt 8 -or $sendgridKey -eq "REPLACE_ME") {
	throw "infra/.env.local must set SENDGRID_API_KEY to a real SendGrid key (not REPLACE_ME)."
}
if ($emailFrom.Length -eq 0 -or $emailFrom.ToLower().Contains("replace_me") -or $emailFrom.ToLower().Contains("localhost")) {
	throw "infra/.env.local must set EMAIL_FROM to a SendGrid-verified sender (not localhost or REPLACE_ME)."
}
if (-not (Test-Path (Join-Path $server "node_modules"))) {
	Invoke-Native -FilePath "npm" -ArgumentList @("ci") -WorkingDirectory $server -FailMessage "server npm ci failed"
}
Invoke-Native -FilePath "npm" -ArgumentList @("run", "build") -WorkingDirectory $server -FailMessage "server build failed"
Invoke-Native -FilePath "docker" -ArgumentList @("compose", "up", "--build", "-d", "--force-recreate", "--remove-orphans") -WorkingDirectory $infra -FailMessage "docker compose up failed"
Invoke-Native -FilePath "docker" -ArgumentList @("compose", "ps") -WorkingDirectory $infra -FailMessage "docker compose ps failed"
Invoke-RepoScript "backend-verify.ps1"
