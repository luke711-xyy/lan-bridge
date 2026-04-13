import path from "node:path";

import { BrowserWindow, app, clipboard, ipcMain, screen } from "electron";

import { AppCoordinator } from "./services/app-coordinator";

let mainWindow: BrowserWindow | null = null;
let coordinator: AppCoordinator | null = null;
const DEFAULT_WINDOW_WIDTH = 640;
const SNAPPED_WINDOW_WIDTH = 360;
const SNAP_TOLERANCE = 28;
let snapAdjustTimer: NodeJS.Timeout | null = null;
let applyingSnapBounds = false;

type SnapEdge = "left" | "right";

function detectSnapEdge(window: BrowserWindow): SnapEdge | null {
  const bounds = window.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const alignsTop = Math.abs(bounds.y - workArea.y) <= SNAP_TOLERANCE;
  const fillsHeight = Math.abs(bounds.height - workArea.height) <= SNAP_TOLERANCE;
  const usesFullWidth = bounds.width >= workArea.width - SNAP_TOLERANCE * 2;

  if (!alignsTop || !fillsHeight || usesFullWidth) {
    return null;
  }

  const alignsLeft = Math.abs(bounds.x - workArea.x) <= SNAP_TOLERANCE;
  const alignsRight =
    Math.abs(bounds.x + bounds.width - (workArea.x + workArea.width)) <= SNAP_TOLERANCE;

  if (alignsLeft) {
    return "left";
  }

  if (alignsRight) {
    return "right";
  }

  return null;
}

function applyCompactSnapWidth(window: BrowserWindow): void {
  if (applyingSnapBounds || window.isDestroyed() || window.isMaximized() || window.isMinimized()) {
    return;
  }

  const edge = detectSnapEdge(window);

  if (!edge) {
    return;
  }

  const bounds = window.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const targetX = edge === "left" ? workArea.x : workArea.x + workArea.width - SNAPPED_WINDOW_WIDTH;

  if (bounds.width === SNAPPED_WINDOW_WIDTH && Math.abs(bounds.x - targetX) <= 1) {
    return;
  }

  applyingSnapBounds = true;
  window.setBounds({
    x: targetX,
    y: workArea.y,
    width: SNAPPED_WINDOW_WIDTH,
    height: workArea.height
  });
  setTimeout(() => {
    applyingSnapBounds = false;
  }, 120);
}

function scheduleSnapCheck(window: BrowserWindow): void {
  if (snapAdjustTimer) {
    clearTimeout(snapAdjustTimer);
  }

  snapAdjustTimer = setTimeout(() => {
    snapAdjustTimer = null;
    applyCompactSnapWidth(window);
  }, 90);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: 760,
    minWidth: 560,
    minHeight: 620,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f4f1eb",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    await mainWindow.loadURL("http://127.0.0.1:5180");
  }

  mainWindow.on("move", () => scheduleSnapCheck(mainWindow!));
  mainWindow.on("resize", () => scheduleSnapCheck(mainWindow!));
}

function wireIpc(): void {
  ipcMain.handle("app:get-state", async () => coordinator?.getState());
  ipcMain.handle("app:choose-directory", async () => coordinator?.chooseReceiveDirectory());
  ipcMain.handle("app:choose-files", async () => coordinator?.chooseFiles());
  ipcMain.handle("app:open-directory", async () => coordinator?.openReceiveDirectory());
  ipcMain.handle("app:reveal-path", async (_event, payload) => coordinator?.revealPath(payload.targetPath));
  ipcMain.handle("app:copy-text", async (_event, payload) => {
    clipboard.writeText(payload.text ?? "");
  });
  ipcMain.handle("app:request-pairing", async (_event, payload) =>
    coordinator?.requestPairing(payload.deviceId, payload.enteredCode)
  );
  ipcMain.handle("app:respond-pairing", async (_event, payload) =>
    coordinator?.respondToPairRequest(payload.requestId, payload.accepted)
  );
  ipcMain.handle("app:send-text", async (_event, payload) =>
    coordinator?.sendText(payload.text, payload.targetDeviceIds)
  );
  ipcMain.handle("app:send-files", async (_event, payload) =>
    coordinator?.sendFiles(payload.filePaths, payload.targetDeviceIds)
  );
}

app.whenReady().then(async () => {
  coordinator = new AppCoordinator();
  await coordinator.start();
  coordinator.on("state", (state) => {
    mainWindow?.webContents.send("state:update", state);
  });

  wireIpc();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (snapAdjustTimer) {
    clearTimeout(snapAdjustTimer);
    snapAdjustTimer = null;
  }
  coordinator?.stop();
});
