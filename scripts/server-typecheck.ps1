# Type-check the Nakama TypeScript runtime without emitting JS.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "server")
npm run typecheck
