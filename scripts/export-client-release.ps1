# Export a release Windows desktop build to client/exports/.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Client = Join-Path $RepoRoot "client"
$Godot = Get-GodotExport
$OutDir = Join-Path $Client "exports\windows"
$Out = Join-Path $OutDir "small-mmorpg.exe"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$presetPath = Join-Path $Client "export_presets.cfg"
if (-not (Test-Path $presetPath)) {
	throw "Missing client/export_presets.cfg."
}
Write-Host "Exporting release client to $Out"
if (Test-Path $Out) {
	Remove-Item -Force $Out
}
$code = Invoke-GodotExport -Godot $Godot -ArgumentList @(
	"--headless",
	"--path", $Client,
	"--export-release",
	"`"Windows Desktop`"",
	"`"$Out`""
)
Assert-GodotExportOutput -Path $Out -ExitCode $code -FailMessage "Release export failed (exit $code). Run powershell -File scripts/install-export-templates.ps1, or install Godot 4.7.1 export templates from the editor, then retry."
Write-Host "release_export=$Out"
