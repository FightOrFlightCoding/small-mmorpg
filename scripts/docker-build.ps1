# Build the pinned Nakama runtime image from server/Dockerfile.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
Invoke-Native -FilePath "docker" -ArgumentList @("build", "-f", "server/Dockerfile", "-t", "vibecode-nakama:3.40.0", "server") -WorkingDirectory $RepoRoot -FailMessage "docker image build failed"
Write-Host "image=vibecode-nakama:3.40.0"
