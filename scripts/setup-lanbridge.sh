#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-LanBridge}"
NODE_VERSION="${NODE_VERSION:-20}"
ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ELECTRON_CACHE="${REPO_ROOT}/.electron-cache"
NPM_CACHE="${REPO_ROOT}/.npm-cache"

step() {
  printf '\n==> %s\n' "$1"
}

if ! command -v conda >/dev/null 2>&1; then
  echo "未找到 conda。请先安装 Miniconda/Anaconda，并确保 conda 在 PATH 中。" >&2
  exit 1
fi

step "初始化 conda shell"
eval "$(conda shell.bash hook)"

if ! conda env list | awk '{print $1}' | grep -qx "${ENV_NAME}"; then
  step "创建 conda 环境 ${ENV_NAME}，并安装 nodejs=${NODE_VERSION}"
  conda create -n "${ENV_NAME}" -y -c conda-forge "nodejs=${NODE_VERSION}"
else
  echo "conda 环境 ${ENV_NAME} 已存在，跳过创建。"
fi

step "激活 conda 环境 ${ENV_NAME}"
conda activate "${ENV_NAME}"

step "配置 Electron 镜像与缓存"
mkdir -p "${ELECTRON_CACHE}" "${NPM_CACHE}"
export ELECTRON_MIRROR
export ELECTRON_CACHE
export npm_config_cache="${NPM_CACHE}"

step "安装 npm 依赖"
cd "${REPO_ROOT}"
npm install --no-audit --no-fund

step "验证 Electron 二进制"
npx electron --version

step "验证项目构建"
npm run build

printf '\n初始化完成。\n'
printf '后续使用：\n'
printf '1. conda activate %s\n' "${ENV_NAME}"
printf '2. cd "%s"\n' "${REPO_ROOT}"
printf '3. npm run dev\n'
