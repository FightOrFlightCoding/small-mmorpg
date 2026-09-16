# Verify migrated saves are current and re-running would not change them.
$ErrorActionPreference = "Stop"
$MigrateArgs = @($args)
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
Invoke-Native -FilePath "npm" -ArgumentList (@("run", "migrate", "--", "verify") + $MigrateArgs) -WorkingDirectory (Join-Path $RepoRoot "server") -FailMessage "migrate verify failed"
