# Shared helpers for developer scripts. Dot-source from the same directory.
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
	return (Split-Path -Parent $PSScriptRoot)
}

function Get-GodotConsole {
	$candidates = @()
	if ($env:GODOT_BIN) {
		$candidates += $env:GODOT_BIN
	}
	$candidates += @(
		"C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64_console.exe",
		"C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64.exe"
	)
	foreach ($candidate in $candidates) {
		if ($candidate -and (Test-Path $candidate)) {
			return $candidate
		}
	}
	$fromPath = Get-Command godot -ErrorAction SilentlyContinue
	if ($null -ne $fromPath) {
		return $fromPath.Source
	}
	throw "Godot 4.7.1 not found. Install it or set GODOT_BIN to the console binary."
}

function Get-GodotGame {
	if ($env:GODOT_BIN -and (Test-Path $env:GODOT_BIN)) {
		return $env:GODOT_BIN
	}
	$game = "C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64.exe"
	if (Test-Path $game) {
		return $game
	}
	return Get-GodotConsole
}

function Invoke-RepoScript {
	param(
		[Parameter(Mandatory = $true)]
		[string]$ScriptName,
		[string[]]$ArgumentList = @()
	)
	$path = Join-Path $PSScriptRoot $ScriptName
	if (-not (Test-Path $path)) {
		throw "Missing script: $path"
	}
	$procArgs = @("-NoProfile", "-File", $path) + @($ArgumentList)
	& powershell.exe @procArgs
	if ($LASTEXITCODE -ne 0) {
		throw "$ScriptName failed (exit $LASTEXITCODE)."
	}
}

function Invoke-Native {
	param(
		[Parameter(Mandatory = $true)]
		[string]$FilePath,
		[string[]]$ArgumentList = @(),
		[string]$WorkingDirectory = "",
		[string]$FailMessage = "Command failed."
	)
	if ($WorkingDirectory -ne "") {
		Push-Location $WorkingDirectory
	}
	try {
		& $FilePath @ArgumentList
		if ($LASTEXITCODE -ne 0) {
			throw "$FailMessage (exit $LASTEXITCODE)"
		}
	}
	finally {
		if ($WorkingDirectory -ne "") {
			Pop-Location
		}
	}
}

function Test-NakamaHealthy {
	try {
		$health = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:7350/v2/rpc/vibecode_health?http_key=defaulthttpkey&unwrap" -ContentType "application/json" -Body "{}" -TimeoutSec 3
		return [bool]$health.ok
	}
	catch {
		return $false
	}
}

function Assert-ContentHashes {
	$repo = Get-RepoRoot
	$bundle = Get-Content (Join-Path $repo "client\content\bundle.json") -Raw | ConvertFrom-Json
	$server = Select-String -Path (Join-Path $repo "server\src\generated\content.ts") -Pattern 'export const contentHash = "([a-f0-9]{64})"'
	if ($null -eq $server) {
		throw "server/src/generated/content.ts is missing contentHash."
	}
	$serverHash = $server.Matches[0].Groups[1].Value
	$clientHash = [string]$bundle.contentHash
	if ($clientHash -notmatch "^[a-f0-9]{64}$") {
		throw "client/content/bundle.json contentHash is missing."
	}
	if ($clientHash -ne $serverHash) {
		throw "Client and server content hashes differ. Run scripts/content-build.ps1."
	}
	Write-Host "content_hash=$clientHash"
}
