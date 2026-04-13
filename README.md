# Lan Bridge

一个面向 `Windows + macOS` 的局域网桌面互传工具。它使用 `Electron + React + WebSocket + HTTP streaming`，支持：

- 局域网自动发现设备
- 六位配对码确认
- 勾选单台或多台设备发送文字
- 点击或拖拽文件发送
- 接收端自动保存到设定目录

## Development

```bash
npm install
npm run dev
```

### One-click setup with Conda

Windows PowerShell:

```powershell
cd F:\CODEX\lan-bridge
.\scripts\setup-lanbridge.ps1
```

macOS / bash:

```bash
cd ~/Projects/lan-bridge
bash ./scripts/setup-lanbridge.sh
```

The scripts will:

- create a Conda environment named `LanBridge`
- install `nodejs=20` from `conda-forge`
- configure the Electron mirror to `https://npmmirror.com/mirrors/electron/`
- use local `.electron-cache` and `.npm-cache`
- run `npm install`
- verify `npx electron --version`
- run `npm run build`

如果你的网络环境里 `electron` 安装脚本偶发失败，可以先执行：

```bash
npm install --ignore-scripts
npm run build
```

这样可以先验证 TypeScript 和前端构建；真正运行桌面端时仍建议重新执行一次正常的 `npm install`，确保 Electron 二进制下载完整。

## Build

```bash
npm run dist
```

## 使用方式

1. 在两台设备上分别启动应用。
2. 每台设备先设置一个本地接收文件夹。
3. 等待局域网设备出现在右侧列表。
4. 对未配对设备点击“配对”，输入对方窗口顶部显示的六位配对码。
5. 对方接受请求后，该设备会变成“已配对”。
6. 勾选一个或多个目标设备。
7. 输入文字点击发送，或拖拽文件到虚线框。

## 当前实现

- 发现：`Bonjour/mDNS + UDP 广播`
- 控制通道：`WebSocket`
- 文件传输：`HTTP POST` 原始流
- 配置持久化：Electron `userData/config.json`

## 注意事项

- 首版默认局域网可信，不强制 TLS/SSH。
- 首次运行时，系统防火墙可能会询问是否允许局域网访问，需要允许。
- 同名文件会自动落盘为 `name (1).ext` 这类形式，避免覆盖。
