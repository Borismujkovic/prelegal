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

# Which host port did we actually get? Port 8000 is only the default: both the
# shell and .env can move it via PRELEGAL_PORT, and compose applies its own
# precedence between the two. Asking compose what it published beats
# re-deriving that here - and it is the difference between polling our own
# container and polling whatever else happens to hold 8000.
$hostPort = '8000'
try {
    $published = docker compose port prelegal 8000 2>$null | Select-Object -Last 1
    if ($published -match ':(\d+)\s*$') { $hostPort = $Matches[1] }
} catch {
    # Fall back to the default and let the health poll below be the judge.
}
$baseUrl = "http://localhost:$hostPort"

Write-Host -NoNewline "Waiting for $baseUrl "
foreach ($attempt in 1..60) {
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/api/health" `
            -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Host ''
            Write-Host "Prelegal is up:  $baseUrl"
            Write-Host "API docs:        $baseUrl/docs"
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
