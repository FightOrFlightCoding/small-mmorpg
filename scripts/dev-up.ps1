# Build the runtime and start PostgreSQL + Nakama.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Invoke-RepoScript "backend-up.ps1"
