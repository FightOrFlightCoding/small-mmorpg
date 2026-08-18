# Project-owned content CLI. Equivalent to tools/content-build commands.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $RepoRoot "tools\content-build")
if (-not (Test-Path "node_modules")) {
	npm ci
}
if ($args.Count -eq 0) {
	npm run generate
	exit $LASTEXITCODE
}
npm run typecheck
if ($LASTEXITCODE -ne 0) {
	exit $LASTEXITCODE
}
npx tsc -p tsconfig.json
if ($LASTEXITCODE -ne 0) {
	exit $LASTEXITCODE
}
node dist/src/cli.js @args
