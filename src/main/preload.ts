import { contextBridge, ipcRenderer } from "electron";

import type { AppState } from "../shared/types";

const bridge = {
  getAppState: (): Promise<AppState> => ipcRenderer.invoke("app:get-state"),
  chooseReceiveDirectory: (): Promise<string> => ipcRenderer.invoke("app:choose-directory"),
  openReceiveDirectory: (): Promise<void> => ipcRenderer.invoke("app:open-directory"),
  requestPairing: (deviceId: string, enteredCode: string): Promise<void> =>
    ipcRenderer.invoke("app:request-pairing", { deviceId, enteredCode }),
  respondToPairRequest: (requestId: string, accepted: boolean): Promise<void> =>
    ipcRenderer.invoke("app:respond-pairing", { requestId, accepted }),
  sendText: (text: string, targetDeviceIds: string[]): Promise<void> =>
    ipcRenderer.invoke("app:send-text", { text, targetDeviceIds }),
  sendFiles: (filePaths: string[], targetDeviceIds: string[]): Promise<void> =>
    ipcRenderer.invoke("app:send-files", { filePaths, targetDeviceIds }),
  onDevicesChanged: (callback: (devices: AppState["devices"]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state.devices);
    ipcRenderer.on("state:update", listener);
    return () => ipcRenderer.removeListener("state:update", listener);
  },
  onTransfersChanged: (callback: (transfers: AppState["transfers"]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state.transfers);
    ipcRenderer.on("state:update", listener);
    return () => ipcRenderer.removeListener("state:update", listener);
  },
  onMessagesChanged: (callback: (messages: AppState["messages"]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state.messages);
    ipcRenderer.on("state:update", listener);
    return () => ipcRenderer.removeListener("state:update", listener);
  },
  onStateChanged: (callback: (state: AppState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on("state:update", listener);
    return () => ipcRenderer.removeListener("state:update", listener);
  }
};

contextBridge.exposeInMainWorld("bridge", bridge);
