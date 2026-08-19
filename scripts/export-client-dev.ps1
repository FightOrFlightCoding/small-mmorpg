# Export a debug Windows desktop build to client/exports/.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Client = Join-Path $RepoRoot "client"
$Godot = Get-GodotExport
$OutDir = Join-Path $Client "exports\windows"
$Out = Join-Path $OutDir "small-mmorpg-dev.exe"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$presetPath = Join-Path $Client "export_presets.cfg"
if (-not (Test-Path $presetPath)) {
	throw "Missing client/export_presets.cfg."
}
Write-Host "Exporting debug client to $Out"
if (Test-Path $Out) {
	Remove-Item -Force $Out
}
$code = Invoke-GodotExport -Godot $Godot -ArgumentList @(
	"--headless",
	"--path", $Client,
	"--export-debug",
	"`"Windows Desktop (Debug)`"",
	"`"$Out`""
)
Assert-GodotExportOutput -Path $Out -ExitCode $code -FailMessage "Debug export failed (exit $code). Run powershell -File scripts/install-export-templates.ps1, then retry."
Write-Host "debug_export=$Out"
