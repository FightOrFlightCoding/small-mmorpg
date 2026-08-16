# Non-destructive save-schema dry run.
$ErrorActionPreference = "Stop"
$MigrateArgs = @($args)
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
Invoke-Native -FilePath "npm" -ArgumentList (@("run", "migrate", "--", "dry-run") + $MigrateArgs) -WorkingDirectory (Join-Path $RepoRoot "server") -FailMessage "migrate dry-run failed"
