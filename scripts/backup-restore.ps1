# Restore a dump into the named environment. Production/staging require an overwrite token.
param(
	[Parameter(Mandatory = $true)]
	[string]$Backup,
	[string]$Environment = "",
	[string]$ConfirmToken = "",
	[string]$ConfirmLocal = ""
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$cfg = Get-EnvironmentConfig -Name $Environment
if ($cfg.name -eq "production" -and $ConfirmToken -ne "OVERWRITE-PRODUCTION") {
	throw "Production restore requires -ConfirmToken OVERWRITE-PRODUCTION."
}
if ($cfg.name -eq "staging" -and $ConfirmToken -ne "OVERWRITE-STAGING") {
	throw "Staging restore requires -ConfirmToken OVERWRITE-STAGING."
}
if ($cfg.name -eq "local") {
	Invoke-RepoScript "backup-restore-local.ps1" -ArgumentList @("-Backup", $Backup, "-ConfirmLocal", $(if ($ConfirmLocal -ne "") { $ConfirmLocal } else { "missing" }))
	exit $LASTEXITCODE
}
if ($cfg.dataReset -ne "allowed" -and $ConfirmToken -eq "") {
	throw "Environment '$($cfg.name)' forbids data reset without an overwrite token."
}
throw "Use backup-restore-test.ps1 to restore into nakama_restore_drill. Direct restore of '$($cfg.name)' is not automated beyond local."
