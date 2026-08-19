# Create a custom-format PostgreSQL dump of the named environment database.
param(
	[string]$Environment = ""
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$cfg = Get-EnvironmentConfig -Name $Environment
$container = Get-PostgresContainer -EnvironmentName $cfg.name
$repo = Get-RepoRoot
$backupDir = Join-Path $repo "backups"
if (-not (Test-Path $backupDir)) {
	New-Item -ItemType Directory -Path $backupDir | Out-Null
}
$running = docker inspect -f "{{.State.Running}}" $container 2>$null
if ($running -ne "true") {
	throw "Postgres container '$container' is not running. Start it with scripts/backend-up.ps1 (local) or the matching compose file."
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "nakama-$($cfg.name)-$stamp.dump"
$outPath = Join-Path $backupDir $fileName
$remote = "/tmp/$fileName"
docker exec $container pg_dump -U postgres -Fc $cfg.database.name -f $remote
if ($LASTEXITCODE -ne 0) {
	throw "pg_dump failed."
}
docker cp "${container}:${remote}" $outPath
if ($LASTEXITCODE -ne 0) {
	throw "docker cp of dump failed."
}
docker exec $container rm -f $remote | Out-Null
Write-Host "backup=$outPath"
Write-Host "environment=$($cfg.name) database=$($cfg.database.name)"
