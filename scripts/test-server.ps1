# Server domain tests.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Invoke-RepoScript "server-test.ps1"
