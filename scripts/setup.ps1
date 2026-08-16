# Install Node dependencies and verify local tools. Does not start Docker.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot

Write-Host "== tools =="
$node = Get-Command node -ErrorAction Stop
$npm = Get-Command npm -ErrorAction Stop
$docker = Get-Command docker -ErrorAction Stop
$godot = Get-GodotConsole
Write-Host "node: $($node.Source)"
node -v
Write-Host "npm: $($npm.Source)"
Write-Host "docker: $($docker.Source)"
Write-Host "godot: $godot"
& $godot --version
if ($LASTEXITCODE -ne 0) {
	throw "godot --version failed: $LASTEXITCODE"
}

Write-Host "== server npm ci =="
Invoke-Native -FilePath "npm" -ArgumentList @("ci") -WorkingDirectory (Join-Path $RepoRoot "server") -FailMessage "server npm ci failed"

Write-Host "== content-build npm ci =="
Invoke-Native -FilePath "npm" -ArgumentList @("ci") -WorkingDirectory (Join-Path $RepoRoot "tools\content-build") -FailMessage "content-build npm ci failed"

Assert-ContentHashes
Write-Host "Setup complete."
