# Launch Alice and Bob as two graphical game windows.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Invoke-RepoScript "run-client-dev.ps1" -ArgumentList @("-DevUser", "alice")
Invoke-RepoScript "run-client-dev.ps1" -ArgumentList @("-DevUser", "bob")
