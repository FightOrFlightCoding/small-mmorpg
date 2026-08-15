# Bundle the Nakama TypeScript runtime to ES5 at server/build/index.js.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "server")
npm run build
