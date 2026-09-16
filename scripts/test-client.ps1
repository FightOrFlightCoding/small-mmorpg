# Client import, SHELL_LOGIN smoke, and GdUnit4.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Invoke-RepoScript "run-client-shell.ps1"
