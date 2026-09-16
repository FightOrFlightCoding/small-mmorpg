# Confirm Nakama loaded the current JS runtime, not a stale health-only module.
$ErrorActionPreference = "Stop"

$HealthUri = "http://127.0.0.1:7350/v2/rpc/vibecode_health?http_key=defaulthttpkey&unwrap"
$Deadline = (Get-Date).AddSeconds(90)

function Invoke-JsonRpc {
	param(
		[string]$Uri,
		[string]$Body = "{}",
		[hashtable]$Headers = @{}
	)
	return Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body $Body -Headers $Headers
}

Write-Host "Waiting for vibecode-nakama to be healthy..."
while ((Get-Date) -lt $Deadline) {
	$status = docker inspect -f "{{.State.Health.Status}}" vibecode-nakama 2>$null
	if ($status -eq "healthy") {
		break
	}
	Start-Sleep -Seconds 2
}
$finalStatus = docker inspect -f "{{.State.Health.Status}}" vibecode-nakama
if ($finalStatus -ne "healthy") {
	throw "Nakama is not healthy (status=$finalStatus). Check scripts/backend-logs.ps1."
}

Write-Host "Checking vibecode_health..."
$health = Invoke-JsonRpc -Uri $HealthUri
if (-not $health.ok) {
	throw "vibecode_health did not return ok."
}
if ($health.content_version -notmatch "^[a-f0-9]{64}$") {
	throw "vibecode_health content_version is missing or not a 64-hex catalog hash."
}
$rpcs = @($health.rpcs)
if ($rpcs -notcontains "character_bootstrap" -or $rpcs -notcontains "find_or_create_starter_zone" -or $rpcs -notcontains "character_list" -or $rpcs -notcontains "session_handshake" -or $rpcs -notcontains "auth_gateway") {
	throw "Nakama is running a stale runtime. Health rpcs=$($rpcs -join ','). Rebuild with scripts/backend-up.ps1."
}

Write-Host "Checking character_bootstrap is registered..."
try {
	Invoke-JsonRpc -Uri "http://127.0.0.1:7350/v2/rpc/character_bootstrap?http_key=defaulthttpkey&unwrap" | Out-Null
}
catch {
	$detail = $_.ErrorDetails.Message
	if ($null -eq $detail) {
		$detail = $_.Exception.Message
	}
	if ($detail -match "RPC function not found") {
		throw "character_bootstrap is not registered. Rebuild and recreate Nakama with scripts/backend-up.ps1."
	}
}

$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("defaultkey:"))
$authHeaders = @{ Authorization = "Basic $pair" }
Write-Host "Bootstrapping Alice..."
$aliceSession = Invoke-RestMethod -Method Post `
	-Uri "http://127.0.0.1:7350/v2/account/authenticate/device?create=true" `
	-Headers $authHeaders `
	-ContentType "application/json" `
	-Body '{"id":"vibecode-dev-alice","username":"alice"}'
$aliceHeaders = @{ Authorization = "Bearer $($aliceSession.token)" }
$aliceCharacter = Invoke-JsonRpc `
	-Uri "http://127.0.0.1:7350/v2/rpc/character_bootstrap?unwrap" `
	-Headers $aliceHeaders `
	-Body '{"name":"Alice"}'
if (-not $aliceCharacter.characterId) {
	throw "character_bootstrap did not return a character for Alice."
}

Write-Host "Bootstrapping Bob..."
$bobSession = Invoke-RestMethod -Method Post `
	-Uri "http://127.0.0.1:7350/v2/account/authenticate/device?create=true" `
	-Headers $authHeaders `
	-ContentType "application/json" `
	-Body '{"id":"vibecode-dev-bob","username":"bob"}'
$bobHeaders = @{ Authorization = "Bearer $($bobSession.token)" }
$bobCharacter = Invoke-JsonRpc `
	-Uri "http://127.0.0.1:7350/v2/rpc/character_bootstrap?unwrap" `
	-Headers $bobHeaders `
	-Body '{"name":"Bob"}'
if (-not $bobCharacter.characterId) {
	throw "character_bootstrap did not return a character for Bob."
}
if ($aliceCharacter.characterId -eq $bobCharacter.characterId) {
	throw "Alice and Bob resolved to the same character id."
}

Write-Host "Session handshake as Alice..."
$handshakeBody = (@{
	clientVersion = "1.0.0"
	protocolVersion = 1
	contentHash = $health.content_version
	contentVersion = "1.0.0"
} | ConvertTo-Json -Compress)
$handshake = Invoke-JsonRpc `
	-Uri "http://127.0.0.1:7350/v2/rpc/session_handshake?unwrap" `
	-Headers $aliceHeaders `
	-Body $handshakeBody
if (-not $handshake.ok) {
	throw "session_handshake did not return ok."
}

Write-Host "Finding starter zone as Alice..."
$zone = Invoke-JsonRpc `
	-Uri "http://127.0.0.1:7350/v2/rpc/find_or_create_starter_zone?unwrap" `
	-Headers $aliceHeaders `
	-Body "{}"
if (-not $zone.matchId) {
	throw "find_or_create_starter_zone did not return a matchId."
}

Write-Host "Backend verified. Alice=$($aliceCharacter.name) Bob=$($bobCharacter.name) match=$($zone.matchId) hash=$($health.content_version.Substring(0,8))"

Write-Host "Waiting for vibecode-auth-gateway..."
$GatewayDeadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $GatewayDeadline) {
	$gatewayStatus = docker inspect -f "{{.State.Health.Status}}" vibecode-auth-gateway 2>$null
	if ($gatewayStatus -eq "healthy") {
		break
	}
	Start-Sleep -Seconds 2
}
$gatewayHealth = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/health" -TimeoutSec 5
if (-not $gatewayHealth.ok) {
	throw "auth-gateway /health did not return ok."
}
$gatewayReady = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/ready" -TimeoutSec 5
if (-not $gatewayReady.ok) {
	throw "auth-gateway /ready did not return ok (nakama=$($gatewayReady.nakama) email=$($gatewayReady.email))."
}
Write-Host "Auth gateway ready. nakama=$($gatewayReady.nakama) email=$($gatewayReady.email)"
