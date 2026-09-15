#Requires -Version 5.1
<#
.SYNOPSIS
    Stop Prelegal and remove the container, taking the SQLite database with it.
#>
$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

Write-Host 'Stopping Prelegal...'
docker compose down --remove-orphans
if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed.' }
Write-Host 'Stopped.'
