# Stop PostgreSQL and Nakama. Keeps the named Postgres volume.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Invoke-RepoScript "backend-down.ps1"
