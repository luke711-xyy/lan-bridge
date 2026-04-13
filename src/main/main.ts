import path from "node:path";

import { BrowserWindow, app, ipcMain } from "electron";

import { AppCoordinator } from "./services/app-coordinator";

let mainWindow: BrowserWindow | null = null;
let coordinator: AppCoordinator | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 1080,
    minHeight: 760,
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
}

function wireIpc(): void {
  ipcMain.handle("app:get-state", async () => coordinator?.getState());
  ipcMain.handle("app:choose-directory", async () => coordinator?.chooseReceiveDirectory());
  ipcMain.handle("app:choose-files", async () => coordinator?.chooseFiles());
  ipcMain.handle("app:open-directory", async () => coordinator?.openReceiveDirectory());
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
  coordinator?.stop();
});
