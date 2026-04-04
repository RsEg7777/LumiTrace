param(
    [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Wait-ForHttpJson {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 120
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 5
            return $response
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    throw "Timed out waiting for endpoint: $Url"
}

function Wait-ForJobCompletion {
    param(
        [string]$JobId,
        [hashtable]$Headers,
        [int]$TimeoutSeconds = 180
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $statusPayload = Invoke-RestMethod -Uri "http://127.0.0.1:8000/status/$JobId" -Method Get -Headers $Headers -TimeoutSec 10
        if ($statusPayload.status -eq 'completed') {
            return $statusPayload
        }
        if ($statusPayload.status -eq 'failed') {
            throw "Smoke render job failed: $($statusPayload | ConvertTo-Json -Compress)"
        }
        Start-Sleep -Seconds 1
    }

    throw "Timed out waiting for job completion: $JobId"
}

Require-Command -Name docker

Push-Location (Resolve-Path "$PSScriptRoot\..")
try {
    Write-Host "Starting split deployment stack..." -ForegroundColor Cyan
    docker compose -f docker-compose.stack.yml up -d --build

    Write-Host "Waiting for backend health endpoint..." -ForegroundColor Cyan
    $health = Wait-ForHttpJson -Url "http://127.0.0.1:8000/health" -TimeoutSeconds 180
    if (-not $health.database) {
        throw "Health check reported database=false. Payload: $($health | ConvertTo-Json -Compress)"
    }

    Write-Host "Validating runtime mode via /health..." -ForegroundColor Cyan
    if ($health.queue_backend -ne 'redis') {
        throw "Expected queue_backend=redis, got '$($health.queue_backend)'"
    }
    if ($health.embedded_worker_enabled -ne $false) {
        throw "Expected embedded_worker_enabled=false for API service"
    }
    if ($health.queue_backend -eq 'redis' -and $health.broker_available -ne $true) {
        throw "Expected broker_available=true in redis mode. Payload: $($health | ConvertTo-Json -Compress)"
    }

    Write-Host "Validating metrics endpoint..." -ForegroundColor Cyan
    $metrics = Wait-ForHttpJson -Url "http://127.0.0.1:8000/metrics" -TimeoutSeconds 60
    foreach ($field in @('http', 'jobs', 'broker', 'maintenance', 'queue', 'worker')) {
        if (-not $metrics.PSObject.Properties.Name.Contains($field)) {
            throw "Metrics payload missing '$field'"
        }
    }

    if ($metrics.worker.queue_backend -ne 'redis') {
        throw "Expected metrics.worker.queue_backend=redis, got '$($metrics.worker.queue_backend)'"
    }
    if ($metrics.worker.broker.enabled -eq $true -and $metrics.worker.broker.available -ne $true) {
        throw "Metrics reported broker unavailable: $($metrics.worker.broker | ConvertTo-Json -Compress)"
    }

    Write-Host "Running authenticated end-to-end render smoke..." -ForegroundColor Cyan
    $email = "stack-smoke+$([Guid]::NewGuid().ToString('N'))@example.com"
    $registerPayload = @{
        email = $email
        password = 'password123'
        display_name = 'Stack Smoke'
    } | ConvertTo-Json

    $auth = Invoke-RestMethod -Uri "http://127.0.0.1:8000/auth/register" -Method Post -ContentType "application/json" -Body $registerPayload -TimeoutSec 15
    if (-not $auth.access_token) {
        throw "Missing access token from register response"
    }

    $tokenHeaders = @{ Authorization = "Bearer $($auth.access_token)" }
    $inputPath = Join-Path $env:TEMP "lumitrace-smoke-$([Guid]::NewGuid().ToString('N')).png"
    $outputPath = Join-Path $env:TEMP "lumitrace-smoke-out-$([Guid]::NewGuid().ToString('N')).bin"
    [IO.File]::WriteAllBytes(
        $inputPath,
        [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+0xQAAAAASUVORK5CYII=')
    )

    try {
        $submitResponse = Invoke-WebRequest -Uri "http://127.0.0.1:8000/process/image" -Method Post -Headers $tokenHeaders -Form @{
            file = Get-Item $inputPath
            samples = '32'
            max_bounces = '2'
            use_denoising = 'true'
            use_neural = 'false'
            exposure = '1.0'
        } -TimeoutSec 30
        $submitPayload = $submitResponse.Content | ConvertFrom-Json
        if (-not $submitPayload.job_id) {
            throw "Missing job_id in process response"
        }

        [void](Wait-ForJobCompletion -JobId $submitPayload.job_id -Headers $tokenHeaders -TimeoutSeconds 180)

        Invoke-WebRequest -Uri "http://127.0.0.1:8000/download/$($submitPayload.job_id)" -Method Get -Headers $tokenHeaders -OutFile $outputPath -TimeoutSec 30
        if ((Get-Item $outputPath).Length -lt 8) {
            throw "Downloaded artifact is unexpectedly small"
        }

        $postMetrics = Wait-ForHttpJson -Url "http://127.0.0.1:8000/metrics" -TimeoutSeconds 30
        if ($postMetrics.queue.completed_jobs -lt 1) {
            throw "Expected queue.completed_jobs >= 1 after render. Payload: $($postMetrics | ConvertTo-Json -Compress)"
        }
        if ($postMetrics.broker.enqueue_added_total -lt 1) {
            throw "Expected broker.enqueue_added_total >= 1 after render. Payload: $($postMetrics | ConvertTo-Json -Compress)"
        }
    }
    finally {
        Remove-Item -Path $inputPath -ErrorAction SilentlyContinue
        Remove-Item -Path $outputPath -ErrorAction SilentlyContinue
    }

    Write-Host "Stack verification succeeded with end-to-end render smoke." -ForegroundColor Green
}
finally {
    if (-not $KeepRunning) {
        Write-Host "Stopping stack..." -ForegroundColor Cyan
        docker compose -f docker-compose.stack.yml down -v
    } else {
        Write-Host "Stack left running due to -KeepRunning." -ForegroundColor Yellow
    }
    Pop-Location
}
