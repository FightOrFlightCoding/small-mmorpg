# Prompt 18 freeze audit: storage, protocol, pins, vendor tree, content hash.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
Invoke-Native -FilePath "node" -ArgumentList @((Join-Path $RepoRoot "tools\foundation-audit\audit.cjs")) -WorkingDirectory $RepoRoot -FailMessage "foundation audit failed"
