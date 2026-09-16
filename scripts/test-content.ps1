# Content-build tests plus client/server hash match.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Invoke-RepoScript "content-test.ps1"
Assert-ContentHashes
