#Requires -Version 5.1
<#
.SYNOPSIS
    Start Prelegal. Builds the image if needed, then waits until the API answers.
.DESCRIPTION
    The database is recreated from scratch on every start - nothing entered in a
    previous run survives this.
#>
$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

Write-Host 'Building and starting Prelegal...'
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed.' }

Write-Host -NoNewline 'Waiting for http://localhost:8000 '
foreach ($attempt in 1..60) {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:8000/api/health' `
            -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Host ''
            Write-Host 'Prelegal is up:  http://localhost:8000'
            Write-Host 'API docs:        http://localhost:8000/docs'
            exit 0
        }
    } catch {
        # Not up yet; keep waiting.
    }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 1
}

# Write-Host, not Write-Error: under $ErrorActionPreference = 'Stop' a
# Write-Error terminates the script, and the log dump below is the whole point
# of this branch.
Write-Host ''
Write-Host 'Timed out waiting for the API. Recent logs:' -ForegroundColor Red
docker compose logs --tail=40
exit 1
