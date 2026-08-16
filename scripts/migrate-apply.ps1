# Apply save-schema migrations. Fixture apply writes JSON; live apply uses Nakama console.
$ErrorActionPreference = "Stop"
$MigrateArgs = @($args)
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
Invoke-Native -FilePath "npm" -ArgumentList (@("run", "migrate", "--", "apply") + $MigrateArgs) -WorkingDirectory (Join-Path $RepoRoot "server") -FailMessage "migrate apply failed"
