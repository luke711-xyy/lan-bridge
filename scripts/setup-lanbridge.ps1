param(
  [string]$EnvName = "LanBridge",
  [string]$NodeVersion = "20",
  [string]$ElectronMirror = "https://npmmirror.com/mirrors/electron/"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$electronCache = Join-Path $repoRoot ".electron-cache"
$npmCache = Join-Path $repoRoot ".npm-cache"

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Ensure-Conda {
  $conda = Get-Command conda -ErrorAction SilentlyContinue
  if (-not $conda) {
    throw "Conda was not found. Install Miniconda or Anaconda first, then make sure conda is in PATH."
  }
}

function Initialize-CondaShell {
  $hook = (& conda shell.powershell hook) | Out-String
  Invoke-Expression $hook
}

function Ensure-CondaEnv {
  param(
    [string]$Name,
    [string]$Version
  )

  $envListJson = conda env list --json | Out-String
  $envList = $envListJson | ConvertFrom-Json
  $existingEnv = @($envList.envs) | Where-Object {
    [System.IO.Path]::GetFileName($_) -eq $Name
  }

  if ($existingEnv.Count -gt 0) {
    Write-Host "Conda environment '$Name' already exists. Skipping creation."
    return
  }

  Write-Step "Creating conda environment '$Name' with nodejs=$Version"
  conda create -n $Name -y -c conda-forge "nodejs=$Version"
}

Write-Step "Checking conda"
Ensure-Conda
Initialize-CondaShell
Ensure-CondaEnv -Name $EnvName -Version $NodeVersion

Write-Step "Activating conda environment '$EnvName'"
conda activate $EnvName

Write-Step "Configuring Electron mirror and caches"
New-Item -ItemType Directory -Force -Path $electronCache | Out-Null
New-Item -ItemType Directory -Force -Path $npmCache | Out-Null
$env:ELECTRON_MIRROR = $ElectronMirror
$env:ELECTRON_CACHE = $electronCache
$env:npm_config_cache = $npmCache

Write-Step "Installing npm dependencies"
Push-Location $repoRoot
try {
  npm install --no-audit --no-fund

  Write-Step "Validating Electron binary"
  npx electron --version

  Write-Step "Validating project build"
  npm run build
}
finally {
  Pop-Location
}

Write-Host "`nSetup complete." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "1. conda activate $EnvName"
Write-Host "2. cd `"$repoRoot`""
Write-Host "3. npm run dev"
