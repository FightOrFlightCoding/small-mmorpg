# Install official Godot 4.7.1 Windows export templates into the editor cache.
$ErrorActionPreference = "Stop"
$VersionFolder = "4.7.1.stable"
$Dest = Join-Path $env:APPDATA "Godot\export_templates\$VersionFolder"
$Release = Join-Path $Dest "windows_release_x86_64.exe"
$Debug = Join-Path $Dest "windows_debug_x86_64.exe"
if ((Test-Path $Release) -and (Test-Path $Debug)) {
	Write-Host "Godot $VersionFolder Windows templates already installed at $Dest"
	exit 0
}

$Urls = @(
	"https://github.com/godotengine/godot-builds/releases/download/4.7.1-stable/Godot_v4.7.1-stable_export_templates.tpz",
	"https://github.com/godotengine/godot/releases/download/4.7.1-stable/Godot_v4.7.1-stable_export_templates.tpz"
)
$TmpDir = Join-Path $env:TEMP "godot-export-templates-4.7.1"
$Tpz = Join-Path $TmpDir "Godot_v4.7.1-stable_export_templates.tpz"
$Zip = Join-Path $TmpDir "Godot_v4.7.1-stable_export_templates.zip"
$Extract = Join-Path $TmpDir "extracted"
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null
$ProgressPreference = "SilentlyContinue"
$downloaded = $false
foreach ($url in $Urls) {
	Write-Host "Downloading $url"
	try {
		Invoke-WebRequest -Uri $url -OutFile $Tpz -UseBasicParsing
		if ((Test-Path $Tpz) -and ((Get-Item $Tpz).Length -gt 1MB)) {
			$downloaded = $true
			break
		}
	}
	catch {
		Write-Host "Download failed from $url : $($_.Exception.Message)"
	}
}
if (-not $downloaded) {
	throw "Could not download Godot 4.7.1 export templates. In the editor: Editor → Manage Export Templates → Download and Install for 4.7.1, then retry scripts/export-client-release.ps1."
}

if (Test-Path $Extract) {
	Remove-Item -Recurse -Force $Extract
}
New-Item -ItemType Directory -Force -Path $Extract | Out-Null
Copy-Item -Force $Tpz $Zip
Write-Host "Extracting templates..."
Expand-Archive -LiteralPath $Zip -DestinationPath $Extract -Force
$Source = Join-Path $Extract "templates"
if (-not (Test-Path $Source)) {
	$nested = Get-ChildItem -Path $Extract -Directory | Select-Object -First 1
	if ($nested -ne $null) {
		$Source = $nested.FullName
	}
}
if (-not (Test-Path (Join-Path $Source "windows_release_x86_64.exe"))) {
	throw "Extracted archive did not contain windows_release_x86_64.exe."
}
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Force -Path (Join-Path $Source "*") -Destination $Dest
if (-not (Test-Path (Join-Path $Dest "version.txt"))) {
	Set-Content -Path (Join-Path $Dest "version.txt") -Value $VersionFolder -NoNewline
}
if (-not ((Test-Path $Release) -and (Test-Path $Debug))) {
	throw "Templates copied but Windows debug/release binaries are still missing at $Dest."
}
Write-Host "Installed Godot $VersionFolder Windows templates to $Dest"
