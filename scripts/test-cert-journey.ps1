# Headless five-client certification journey against local Nakama.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Client = Join-Path $RepoRoot "client"
$Godot = Get-GodotConsole

if (-not (Test-NakamaHealthy)) {
	Write-Host "Nakama is not healthy. Starting scripts/dev-up.ps1..."
	Invoke-RepoScript "dev-up.ps1"
}
if (-not (Test-NakamaHealthy)) {
	throw "Nakama is not reachable at 127.0.0.1:7350."
}

Write-Host "Godot: $Godot"
& $Godot --headless --path $Client --import --quit
if ($LASTEXITCODE -ne 0) {
	throw "Godot import failed: $LASTEXITCODE"
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
Write-Host "== cert five-client journey stamp=$stamp =="
& $Godot --headless --path $Client --scene "res://scenes/e2e/e2e_cert.tscn" -- --cert-five "--cert-stamp=$stamp"
if ($LASTEXITCODE -ne 0) {
	throw "Headless five-client certification failed: $LASTEXITCODE"
}

Write-Host "== restart backend processes =="
docker restart vibecode-nakama | Out-Null
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
	if (Test-NakamaHealthy) {
		break
	}
	Start-Sleep -Seconds 2
}
if (-not (Test-NakamaHealthy)) {
	throw "Nakama did not become healthy after restart."
}
docker restart vibecode-postgres | Out-Null
$pgDeadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $pgDeadline) {
	if (Test-NakamaHealthy) {
		break
	}
	Start-Sleep -Seconds 3
}
if (-not (Test-NakamaHealthy)) {
	throw "Stack did not recover after Postgres restart."
}

Write-Host "== cert five-client resume =="
& $Godot --headless --path $Client --scene "res://scenes/e2e/e2e_cert.tscn" -- --cert-five-resume "--cert-stamp=$stamp"
if ($LASTEXITCODE -ne 0) {
	throw "Headless five-client resume failed: $LASTEXITCODE"
}
Write-Host "Five-client certification passed."
