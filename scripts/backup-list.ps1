# List gitignored dumps under backups/.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$dir = Join-Path (Get-RepoRoot) "backups"
if (-not (Test-Path $dir)) {
	Write-Host "No backups directory."
	exit 0
}
$files = Get-ChildItem -Path $dir -Filter "*.dump" -ErrorAction SilentlyContinue
if ($null -eq $files -or $files.Count -eq 0) {
	Write-Host "No dumps in backups/."
	exit 0
}
$files | Sort-Object LastWriteTime -Descending | ForEach-Object {
	Write-Host ("{0}`t{1} bytes" -f $_.FullName, $_.Length)
}
