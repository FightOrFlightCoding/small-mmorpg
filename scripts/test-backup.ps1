# Accepted backup drill: dump local nakama, restore into nakama_restore_drill, verify.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$infra = Join-Path (Get-RepoRoot) "infra"
$running = docker inspect -f "{{.State.Running}}" vibecode-postgres 2>$null
if ($running -ne "true") {
	Write-Host "Starting local Postgres for the restore drill."
	Invoke-Native -FilePath "docker" -ArgumentList @("compose", "up", "-d", "postgres") -WorkingDirectory $infra -FailMessage "docker compose up postgres failed"
	$deadline = (Get-Date).AddSeconds(60)
	do {
		Start-Sleep -Seconds 2
		$running = docker inspect -f "{{.State.Running}}" vibecode-postgres 2>$null
		$health = docker inspect -f "{{.State.Health.Status}}" vibecode-postgres 2>$null
		if ($running -eq "true" -and $health -eq "healthy") {
			break
		}
	} while ((Get-Date) -lt $deadline)
	if ($health -ne "healthy" -and $running -ne "true") {
		throw "Postgres did not become ready for the restore drill."
	}
}
$createOut = & powershell.exe -NoProfile -File (Join-Path $PSScriptRoot "backup-create.ps1") -Environment local
if ($LASTEXITCODE -ne 0) {
	throw "backup-create failed."
}
$createOut | Write-Host
$line = @($createOut | Where-Object { $_ -like "backup=*" } | Select-Object -Last 1)
if (-not $line) {
	throw "backup-create did not print backup= path."
}
$dump = $line.Substring("backup=".Length)
Invoke-RepoScript "backup-restore-test.ps1" -ArgumentList @("-Backup", $dump)
Invoke-RepoScript "backup-verify.ps1" -ArgumentList @("-Database", "nakama_restore_drill", "-SourceDatabase", "nakama")
Write-Host "backup restore drill passed."
Write-Host "dump=$dump"
Write-Host "restored_into=nakama_restore_drill"
