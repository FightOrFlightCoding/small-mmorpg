# Verify a restored database exists. With -SourceDatabase, table counts must match.
param(
	[string]$Database = "nakama_restore_drill",
	[string]$Container = "vibecode-postgres",
	[string]$SourceDatabase = ""
)
$ErrorActionPreference = "Stop"
$running = docker inspect -f "{{.State.Running}}" $Container 2>$null
if ($running -ne "true") {
	throw "Postgres container '$Container' is not running."
}
$exists = docker exec $Container psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
if ("$exists".Trim() -ne "1") {
	throw "Database '$Database' does not exist."
}
$countRaw = docker exec $Container psql -U postgres -d $Database -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
$n = 0
[void][int]::TryParse("$countRaw".Trim(), [ref]$n)
if ($SourceDatabase -ne "") {
	$srcRaw = docker exec $Container psql -U postgres -d $SourceDatabase -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
	$src = 0
	[void][int]::TryParse("$srcRaw".Trim(), [ref]$src)
	if ($n -ne $src) {
		throw "Restored '$Database' public_tables=$n does not match source '$SourceDatabase' public_tables=$src."
	}
	Write-Host "verify_ok database=$Database public_tables=$n source=$SourceDatabase"
	exit 0
}
Write-Host "verify_ok database=$Database public_tables=$n"
