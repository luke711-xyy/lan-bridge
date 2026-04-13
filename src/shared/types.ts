export type PlatformKind = "windows" | "macos" | "linux";

export type PeerStatus = "online" | "recently-offline";

export type TransferStatus =
  | "queued"
  | "connecting"
  | "sending"
  | "receiving"
  | "complete"
  | "failed";

export interface SelfDeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: PlatformKind;
  wsPort: number;
  httpPort: number;
  pairingCode: string;
}

export interface PeerDevice {
  deviceId: string;
  deviceName: string;
  platform: PlatformKind;
  wsPort: number;
  httpPort: number;
  address: string;
  trusted: boolean;
  status: PeerStatus;
  lastSeenAt: number;
  lastResolvedAt: number;
  source: "udp" | "mdns" | "socket";
}

export interface TextMessage {
  messageId: string;
  senderDeviceId: string;
  senderDeviceName: string;
  targetDeviceIds: string[];
  text: string;
  timestamp: number;
  direction: "incoming" | "outgoing";
}

export interface TransferRecord {
  transferId: string;
  fileName: string;
  fileSize: number;
  senderDeviceId: string;
  senderDeviceName: string;
  targetDeviceIds: string[];
  direction: "incoming" | "outgoing";
  status: TransferStatus;
  progress: number;
  updatedAt: number;
  error?: string;
  savedPath?: string;
}

export interface PendingPairRequest {
  requestId: string;
  fromDeviceId: string;
  fromDeviceName: string;
  requestedAt: number;
}

export interface AppConfig {
  deviceId: string;
  deviceName: string;
  receiveDirectory: string;
  trustedPeers: string[];
  lastSelectedTargets: string[];
  preferredPorts: {
    wsPort: number;
    httpPort: number;
    udpPort: number;
  };
}

export interface AppState {
  self: SelfDeviceInfo;
  receiveDirectory: string;
  networkLabel: string;
  devices: PeerDevice[];
  messages: TextMessage[];
  transfers: TransferRecord[];
  pendingPairRequests: PendingPairRequest[];
  lastSelectedTargets: string[];
}

export interface DiscoveryBroadcast {
  protocol: "lan-bridge";
  version: 1;
  deviceId: string;
  deviceName: string;
  wsPort: number;
  httpPort: number;
  platform: PlatformKind;
  timestamp: number;
}

export type SocketEnvelope =
  | {
      type: "hello";
      payload: DiscoveryBroadcast;
    }
  | {
      type: "pair_request";
      payload: {
        requestId: string;
        from: DiscoveryBroadcast;
        enteredCode: string;
      };
    }
  | {
      type: "pair_response";
      payload: {
        requestId: string;
        accepted: boolean;
        reason?: string;
        responderId: string;
      };
    }
  | {
      type: "text_message";
      payload: TextMessage;
    };
