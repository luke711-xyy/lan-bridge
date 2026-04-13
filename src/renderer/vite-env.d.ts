/// <reference types="vite/client" />

import type { AppState } from "../shared/types";

declare global {
  interface Window {
    bridge: {
      getAppState: () => Promise<AppState>;
      chooseReceiveDirectory: () => Promise<string>;
      openReceiveDirectory: () => Promise<void>;
      requestPairing: (deviceId: string, enteredCode: string) => Promise<void>;
      respondToPairRequest: (requestId: string, accepted: boolean) => Promise<void>;
      sendText: (text: string, targetDeviceIds: string[]) => Promise<void>;
      sendFiles: (filePaths: string[], targetDeviceIds: string[]) => Promise<void>;
      onDevicesChanged: (callback: (devices: AppState["devices"]) => void) => () => void;
      onTransfersChanged: (callback: (transfers: AppState["transfers"]) => void) => () => void;
      onMessagesChanged: (callback: (messages: AppState["messages"]) => void) => () => void;
      onStateChanged: (callback: (state: AppState) => void) => () => void;
    };
  }

  interface File {
    path?: string;
  }
}

export {};
