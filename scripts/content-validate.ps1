# Validate authored content without generating bundles.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Invoke-RepoScript "content.ps1" -ArgumentList @("validate")
