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
    throw "未找到 conda。请先安装 Miniconda/Anaconda，并确认 conda 在 PATH 中。"
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

  $envs = conda env list | Out-String
  if ($envs -match "(?m)^\s*$([regex]::Escape($Name))\s") {
    Write-Host "conda 环境 $Name 已存在，跳过创建。"
    return
  }

  Write-Step "创建 conda 环境 $Name，并安装 nodejs=$Version"
  conda create -n $Name -y -c conda-forge "nodejs=$Version"
}

Write-Step "检查 conda"
Ensure-Conda
Initialize-CondaShell
Ensure-CondaEnv -Name $EnvName -Version $NodeVersion

Write-Step "激活 conda 环境 $EnvName"
conda activate $EnvName

Write-Step "配置 Electron 镜像与缓存"
New-Item -ItemType Directory -Force -Path $electronCache | Out-Null
New-Item -ItemType Directory -Force -Path $npmCache | Out-Null
$env:ELECTRON_MIRROR = $ElectronMirror
$env:ELECTRON_CACHE = $electronCache
$env:npm_config_cache = $npmCache

Write-Step "安装 npm 依赖"
Push-Location $repoRoot
try {
  npm install --no-audit --no-fund

  Write-Step "验证 Electron 二进制"
  npx electron --version

  Write-Step "验证项目构建"
  npm run build
}
finally {
  Pop-Location
}

Write-Host "`n初始化完成。" -ForegroundColor Green
Write-Host "后续使用：" -ForegroundColor Green
Write-Host "1. conda activate $EnvName"
Write-Host "2. cd `"$repoRoot`""
Write-Host "3. npm run dev"
