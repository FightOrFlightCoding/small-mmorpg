# Show save-schema migration status for a fixture, account, character, or local-dev users.
$ErrorActionPreference = "Stop"
$MigrateArgs = @($args)
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
Invoke-Native -FilePath "npm" -ArgumentList (@("run", "migrate", "--", "status") + $MigrateArgs) -WorkingDirectory (Join-Path $RepoRoot "server") -FailMessage "migrate status failed"
