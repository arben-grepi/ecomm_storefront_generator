# Script to verify that all secrets referenced in apphosting.yaml exist in Google Cloud Secret Manager
# Usage: .\scripts\verify-secrets.ps1

$ErrorActionPreference = "Stop"

$PROJECT_ID = "ecom-store-generator-41064"
$APPHOSTING_FILE = "apphosting.yaml"

if (-not (Test-Path $APPHOSTING_FILE)) {
    Write-Host "❌ Error: $APPHOSTING_FILE not found!" -ForegroundColor Red
    exit 1
}

Write-Host "🔍 Verifying secrets in $APPHOSTING_FILE..." -ForegroundColor Cyan
Write-Host "Project: $PROJECT_ID"
Write-Host ""

# Extract all secret names from apphosting.yaml (only active ones, not commented)
$secretsInYaml = Get-Content $APPHOSTING_FILE | 
    Select-String '^\s+secret:\s+(\w+)' | 
    ForEach-Object { 
        if ($_.Matches.Success) {
            $_.Matches.Groups[1].Value 
        }
    } |
    Where-Object { $_ -and $_ -notmatch '^#' }

Write-Host "📋 Secrets referenced in apphosting.yaml:" -ForegroundColor Cyan
$secretsInYaml | ForEach-Object { Write-Host "  - $_" }

Write-Host ""
Write-Host "🔍 Checking if secrets exist in Secret Manager..." -ForegroundColor Cyan

# Get all secrets from Secret Manager
try {
    $existingSecretsOutput = gcloud secrets list --project=$PROJECT_ID --format='value(name)' 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error: Failed to list secrets from Secret Manager" -ForegroundColor Red
        Write-Host $existingSecretsOutput
        exit 1
    }
} catch {
    Write-Host "❌ Error: Failed to connect to Secret Manager" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# Convert to array and extract just the secret name (remove project path)
$secretNames = @()
$existingSecretsOutput | ForEach-Object {
    $line = $_.Trim()
    if ($line -and $line -match '/([^/]+)$') {
        $secretNames += $matches[1]
    } elseif ($line -and -not $line.Contains('/')) {
        # Already just the name
        $secretNames += $line
    }
}

Write-Host ""
Write-Host "📊 Verification Results:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$missingSecrets = @()
$foundSecrets = @()

foreach ($secret in $secretsInYaml) {
    if ($secretNames -contains $secret) {
        Write-Host "✅ $secret" -ForegroundColor Green
        $foundSecrets += $secret
    } else {
        Write-Host "❌ $secret - MISSING!" -ForegroundColor Red
        $missingSecrets += $secret
    }
}

Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

if ($missingSecrets.Count -eq 0) {
    Write-Host "✅ All secrets exist in Secret Manager!" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 To grant App Hosting backend access, run:" -ForegroundColor Cyan
    Write-Host "   firebase apphosting:secrets:grantaccess SECRET_NAME --backend BACKEND_ID --project $PROJECT_ID"
    exit 0
} else {
    Write-Host "❌ Missing secrets:" -ForegroundColor Red
    $missingSecrets | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "💡 To create missing secrets, use:" -ForegroundColor Yellow
    Write-Host "   gcloud secrets create SECRET_NAME --project=$PROJECT_ID --data-file=-"
    Write-Host ""
    Write-Host "   Or use the script: .\scripts\create-secrets-from-env.ps1"
    exit 1
}

