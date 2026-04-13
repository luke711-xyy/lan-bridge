/// <reference types="vite/client" />

import type { AppState } from "../shared/types";

declare global {
  interface Window {
    bridge: {
      getAppState: () => Promise<AppState>;
      chooseReceiveDirectory: () => Promise<string>;
      chooseFiles: () => Promise<string[]>;
      openReceiveDirectory: () => Promise<void>;
      revealPath: (targetPath: string) => Promise<void>;
      copyText: (text: string) => Promise<void>;
      requestPairing: (deviceId: string, enteredCode: string) => Promise<void>;
      respondToPairRequest: (requestId: string, accepted: boolean) => Promise<void>;
      sendText: (text: string, targetDeviceIds: string[]) => Promise<void>;
      sendFiles: (filePaths: string[], targetDeviceIds: string[]) => Promise<void>;
      resolveFilePaths: (files: FileList | File[]) => string[];
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
