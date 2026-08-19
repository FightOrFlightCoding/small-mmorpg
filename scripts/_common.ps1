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

function Get-GodotExport {
	$game = "C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64.exe"
	if (Test-Path $game) {
		return $game
	}
	if ($env:GODOT_BIN) {
		$sibling = [regex]::Replace([string]$env:GODOT_BIN, "_console\.exe$", ".exe")
		if ($sibling -ne $env:GODOT_BIN -and (Test-Path $sibling)) {
			return $sibling
		}
	}
	return Get-GodotGame
}

function Invoke-GodotExport {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Godot,
		[Parameter(Mandatory = $true)]
		[string[]]$ArgumentList
	)
	# The GUI-subsystem editor returns immediately from `&`. Start-Process -Wait
	# blocks until export actually finishes.
	$proc = Start-Process -FilePath $Godot -ArgumentList $ArgumentList -Wait -PassThru -NoNewWindow
	return $proc.ExitCode
}

function Assert-GodotExportOutput {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Path,
		[object]$ExitCode,
		[Parameter(Mandatory = $true)]
		[string]$FailMessage
	)
	if ((Test-Path $Path) -and ((Get-Item $Path).Length -gt 1MB)) {
		if ($null -ne $ExitCode -and "$ExitCode" -ne "" -and $ExitCode -ne 0) {
			Write-Host "Godot export exit code was $ExitCode; treating as success because $Path exists."
		}
		return
	}
	throw $FailMessage
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

function Test-AuthGatewayHealthy {
	try {
		$health = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/health" -TimeoutSec 3
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

function Get-EnvironmentName {
	param([string]$Name = "")
	if ($Name -ne "") {
		return $Name
	}
	if ($env:VIBECODE_ENV -and $env:VIBECODE_ENV.Trim() -ne "") {
		return $env:VIBECODE_ENV.Trim()
	}
	return "local"
}

function Get-EnvironmentConfig {
	param([string]$Name = "")
	$envName = Get-EnvironmentName -Name $Name
	$path = Join-Path (Get-RepoRoot) "infra\environments\$envName.json"
	if (-not (Test-Path $path)) {
		throw "Unknown environment '$envName'. Expected $path"
	}
	return Get-Content $path -Raw | ConvertFrom-Json
}

function Assert-DataResetAllowed {
	param([string]$Name = "")
	$cfg = Get-EnvironmentConfig -Name $Name
	if ([string]$cfg.dataReset -ne "allowed") {
		throw "Data reset is forbidden for environment '$($cfg.name)'."
	}
}

function Get-PostgresContainer {
	param([string]$EnvironmentName = "local")
	switch ($EnvironmentName) {
		"automated_test" { return "vibecode-test-postgres" }
		"staging" { return "vibecode-staging-postgres" }
		"production" { return "vibecode-production-postgres" }
		default { return "vibecode-postgres" }
	}
}
