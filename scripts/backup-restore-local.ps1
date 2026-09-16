# Restore a dump into the local nakama database. Refuses staging/production.
param(
	[Parameter(Mandatory = $true)]
	[string]$Backup,
	[string]$ConfirmLocal = ""
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$envName = Get-EnvironmentName
if ($envName -eq "production" -or $envName -eq "staging") {
	throw "Refusing to overwrite local Postgres while VIBECODE_ENV=$envName. Use backup-restore-test.ps1 for a separate database."
}
Assert-DataResetAllowed -Name "local"
if ($ConfirmLocal -ne "RestoreLocal") {
	throw "Pass -ConfirmLocal RestoreLocal to overwrite the local nakama database."
}
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
	throw "Postgres container '$container' is not running."
}
$remote = "/tmp/restore-local.dump"
docker cp $dump "${container}:${remote}"
if ($LASTEXITCODE -ne 0) {
	throw "docker cp of dump failed."
}
docker exec $container psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'nakama' AND pid <> pg_backend_pid();" | Out-Null
docker exec $container psql -U postgres -c "DROP DATABASE IF EXISTS nakama;"
docker exec $container psql -U postgres -c "CREATE DATABASE nakama;"
docker exec $container pg_restore -U postgres -d nakama --no-owner --no-acl $remote
if ($LASTEXITCODE -ne 0) {
	throw "pg_restore into nakama failed."
}
docker exec $container rm -f $remote | Out-Null
Write-Host "restored_local source=$dump"
