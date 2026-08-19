# Restore a dump into a separate drill database on the local Postgres container.
# Never writes nakama, nakama_staging, or nakama_production.
param(
	[Parameter(Mandatory = $true)]
	[string]$Backup
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot
$dump = $Backup
if (-not [System.IO.Path]::IsPathRooted($dump)) {
	$dump = Join-Path $repo $dump
}
if (-not (Test-Path $dump)) {
	throw "Dump not found: $dump"
}
$container = "vibecode-postgres"
$running = docker inspect -f "{{.State.Running}}" $container 2>$null
if ($running -ne "true") {
	throw "Postgres container '$container' is not running. Start local Postgres with scripts/backend-up.ps1."
}
$remote = "/tmp/restore-drill.dump"
docker cp $dump "${container}:${remote}"
if ($LASTEXITCODE -ne 0) {
	throw "docker cp of dump failed."
}
$drill = "nakama_restore_drill"
docker exec $container psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$drill' AND pid <> pg_backend_pid();" | Out-Null
docker exec $container psql -U postgres -c "DROP DATABASE IF EXISTS $drill;"
if ($LASTEXITCODE -ne 0) {
	throw "DROP DATABASE $drill failed."
}
docker exec $container psql -U postgres -c "CREATE DATABASE $drill;"
if ($LASTEXITCODE -ne 0) {
	throw "CREATE DATABASE $drill failed."
}
docker exec $container pg_restore -U postgres -d $drill --no-owner --no-acl $remote
if ($LASTEXITCODE -ne 0) {
	throw "pg_restore into $drill failed."
}
docker exec $container rm -f $remote | Out-Null
Write-Host "restored_into=$drill"
Write-Host "source=$dump"
