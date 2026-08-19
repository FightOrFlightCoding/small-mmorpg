# Export a debug Windows desktop build to client/exports/.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Client = Join-Path $RepoRoot "client"
$Godot = Get-GodotConsole
$OutDir = Join-Path $Client "exports\windows"
$Out = Join-Path $OutDir "small-mmorpg-dev.exe"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$presetPath = Join-Path $Client "export_presets.cfg"
if (-not (Test-Path $presetPath)) {
	throw "Missing client/export_presets.cfg."
}
Write-Host "Exporting debug client to $Out"
& $Godot --headless --path $Client --export-debug "Windows Desktop (Debug)" $Out
if ($LASTEXITCODE -ne 0) {
	throw "Debug export failed (exit $LASTEXITCODE). Install Godot 4.7.1 export templates, then retry."
}
if (-not (Test-Path $Out)) {
	throw "Debug export reported success but $Out is missing. Export templates are probably not installed."
}
Write-Host "debug_export=$Out"
