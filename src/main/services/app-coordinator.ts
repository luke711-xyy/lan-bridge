import { EventEmitter } from "node:events";

import { dialog, shell } from "electron";
import { v4 as uuidv4 } from "uuid";

import type {
  AppState,
  DiscoveryBroadcast,
  PeerDevice,
  TextMessage,
  TransferRecord
} from "../../shared/types";
import { ConfigStore } from "./config-store";
import { DiscoveryService } from "./discovery-service";
import { MessageService } from "./message-service";
import { TransferService } from "./transfer-service";
import { detectPlatform, findAvailablePort, generatePairingCode, getNetworkLabel } from "./utils";

const MAX_MESSAGES = 24;
const MAX_TRANSFERS = 40;

type KnownPairRequest = AppState["pendingPairRequests"][number] & { address: string; wsPort: number };

export class AppCoordinator extends EventEmitter {
  private readonly configStore = new ConfigStore();

  private readonly devices = new Map<string, PeerDevice>();

  private readonly messages: TextMessage[] = [];

  private readonly transfers: TransferRecord[] = [];

  private readonly pendingPairRequests = new Map<string, KnownPairRequest>();

  private readonly pairingCode = generatePairingCode();

  private state!: AppState;

  private discoveryService?: DiscoveryService;

  private messageService?: MessageService;

  private transferService?: TransferService;

  async start(): Promise<void> {
    const config = this.configStore.getSnapshot();
    const wsPort = await findAvailablePort(config.preferredPorts.wsPort);
    const httpPort = await findAvailablePort(config.preferredPorts.httpPort);
    const udpPort = await findAvailablePort(config.preferredPorts.udpPort);
    this.configStore.update({
      preferredPorts: { wsPort, httpPort, udpPort }
    });

    this.state = {
      self: {
        deviceId: config.deviceId,
        deviceName: config.deviceName,
        platform: detectPlatform(),
        wsPort,
        httpPort,
        pairingCode: this.pairingCode
      },
      receiveDirectory: config.receiveDirectory,
      networkLabel: getNetworkLabel(),
      devices: [],
      messages: [],
      transfers: [],
      pendingPairRequests: [],
      lastSelectedTargets: config.lastSelectedTargets
    };

    this.messageService = new MessageService({
      wsPort,
      selfDescriptor: () => this.getDiscoveryDescriptor(),
      onPeerResolved: (payload, address) => this.ingestPeer(payload, address, "socket")
    });
    this.messageService.on("pair-request", (event, fallbackAddress: string) => {
      const matchesCode = event.payload.enteredCode === this.pairingCode;

      if (!matchesCode) {
        void this.messageService?.sendPairResponse(
          fallbackAddress,
          event.payload.from.wsPort,
          event.payload.requestId,
          false,
          "配对码不正确"
        );
        return;
      }

      this.ingestPeer(event.payload.from, fallbackAddress, "socket");
      this.pendingPairRequests.set(event.payload.requestId, {
        requestId: event.payload.requestId,
        fromDeviceId: event.payload.from.deviceId,
        fromDeviceName: event.payload.from.deviceName,
        requestedAt: Date.now(),
        address: fallbackAddress,
        wsPort: event.payload.from.wsPort
      });
      this.emitState();
    });
    this.messageService.on("pair-response", (event) => {
      if (event.payload.accepted) {
        this.configStore.setTrustedPeer(event.payload.responderId, true);
        const device = this.devices.get(event.payload.responderId);
        if (device) {
          this.devices.set(device.deviceId, { ...device, trusted: true });
        }
      }
      this.emitState();
    });
    this.messageService.on("text-message", (event) => {
      this.messages.unshift({
        ...event.payload,
        direction: "incoming"
      });
      this.messages.splice(MAX_MESSAGES);
      this.emitState();
    });

    this.transferService = new TransferService({
      httpPort,
      getReceiveDirectory: () => this.state.receiveDirectory,
      getSelfDeviceId: () => this.state.self.deviceId,
      getSelfDeviceName: () => this.state.self.deviceName
    });
    this.transferService.on("transfer", (record: TransferRecord) => {
      this.upsertTransfer(record);
    });

    this.discoveryService = new DiscoveryService({
      udpPort,
      selfDescriptor: () => this.getDiscoveryDescriptor(),
      onPeerSeen: (payload, address, source) => this.ingestPeer(payload, address, source)
    });
    await this.discoveryService.start();

    setInterval(() => this.reapOfflineDevices(), 3_000).unref();
    this.emitState();
  }

  stop(): void {
    this.discoveryService?.stop();
    this.messageService?.stop();
    this.transferService?.stop();
  }

  getState(): AppState {
    return structuredClone(this.state);
  }

  async chooseReceiveDirectory(): Promise<string> {
    const result = await dialog.showOpenDialog({
      title: "选择接收文件夹",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: this.state.receiveDirectory || undefined
    });

    if (!result.canceled && result.filePaths[0]) {
      this.state.receiveDirectory = result.filePaths[0];
      this.configStore.update({ receiveDirectory: result.filePaths[0] });
      this.emitState();
    }

    return this.state.receiveDirectory;
  }

  async chooseFiles(): Promise<string[]> {
    const result = await dialog.showOpenDialog({
      title: "选择要发送的文件",
      properties: ["openFile", "multiSelections"]
    });

    if (result.canceled) {
      return [];
    }

    return result.filePaths;
  }

  async openReceiveDirectory(): Promise<void> {
    if (!this.state.receiveDirectory) {
      return;
    }
    await shell.openPath(this.state.receiveDirectory);
  }

  async requestPairing(deviceId: string, enteredCode: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device || !this.messageService) {
      throw new Error("设备不在线");
    }
    await this.messageService.sendPairRequest(device.address, device.wsPort, uuidv4(), enteredCode);
  }

  async respondToPairRequest(requestId: string, accepted: boolean): Promise<void> {
    const pending = this.pendingPairRequests.get(requestId);
    if (!pending || !this.messageService) {
      return;
    }

    if (accepted) {
      this.configStore.setTrustedPeer(pending.fromDeviceId, true);
      const device = this.devices.get(pending.fromDeviceId);
      if (device) {
        this.devices.set(device.deviceId, { ...device, trusted: true });
      }
    }

    await this.messageService.sendPairResponse(
      pending.address,
      pending.wsPort,
      requestId,
      accepted,
      accepted ? undefined : "已拒绝"
    );
    this.pendingPairRequests.delete(requestId);
    this.emitState();
  }

  async sendText(text: string, targetDeviceIds: string[]): Promise<void> {
    if (!text.trim() || !this.messageService) {
      return;
    }

    const devices = targetDeviceIds
      .map((deviceId) => this.devices.get(deviceId))
      .filter((device): device is PeerDevice => Boolean(device && device.trusted));

    if (devices.length === 0) {
      throw new Error("请先选择至少一个已配对设备");
    }

    const message: TextMessage = {
      messageId: uuidv4(),
      senderDeviceId: this.state.self.deviceId,
      senderDeviceName: this.state.self.deviceName,
      targetDeviceIds,
      text: text.trim(),
      timestamp: Date.now(),
      direction: "outgoing"
    };

    await Promise.all(
      devices.map((device) => this.messageService!.sendText(device.address, device.wsPort, message))
    );

    this.messages.unshift(message);
    this.messages.splice(MAX_MESSAGES);
    this.state.lastSelectedTargets = targetDeviceIds;
    this.configStore.update({ lastSelectedTargets: targetDeviceIds });
    this.emitState();
  }

  async sendFiles(filePaths: string[], targetDeviceIds: string[]): Promise<void> {
    if (!this.transferService) {
      return;
    }

    const peers = targetDeviceIds
      .map((deviceId) => this.devices.get(deviceId))
      .filter((device): device is PeerDevice => Boolean(device && device.trusted));

    if (peers.length === 0) {
      throw new Error("请先选择至少一个已配对设备");
    }

    await this.transferService.sendFiles(filePaths, peers);
    this.state.lastSelectedTargets = targetDeviceIds;
    this.configStore.update({ lastSelectedTargets: targetDeviceIds });
    this.emitState();
  }

  private getDiscoveryDescriptor(): DiscoveryBroadcast {
    return {
      protocol: "lan-bridge",
      version: 1,
      deviceId: this.state.self.deviceId,
      deviceName: this.state.self.deviceName,
      wsPort: this.state.self.wsPort,
      httpPort: this.state.self.httpPort,
      platform: this.state.self.platform,
      timestamp: Date.now()
    };
  }

  private ingestPeer(payload: DiscoveryBroadcast, address: string, source: PeerDevice["source"]): void {
    if (payload.deviceId === this.state.self.deviceId) {
      return;
    }

    const trustedPeers = new Set(this.configStore.getSnapshot().trustedPeers);
    const previous = this.devices.get(payload.deviceId);
    this.devices.set(payload.deviceId, {
      ...previous,
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      platform: payload.platform,
      wsPort: payload.wsPort,
      httpPort: payload.httpPort,
      address,
      trusted: trustedPeers.has(payload.deviceId),
      status: "online",
      lastSeenAt: Date.now(),
      lastResolvedAt: Date.now(),
      source
    });
    this.emitState();
  }

  private reapOfflineDevices(): void {
    let changed = false;

    for (const [deviceId, device] of this.devices.entries()) {
      const age = Date.now() - device.lastSeenAt;
      const nextStatus = age < 8_000 ? "online" : "recently-offline";
      if (nextStatus !== device.status) {
        this.devices.set(deviceId, { ...device, status: nextStatus });
        changed = true;
      }
    }

    if (changed) {
      this.emitState();
    }
  }

  private upsertTransfer(record: TransferRecord): void {
    const index = this.transfers.findIndex((item) => item.transferId === record.transferId);
    if (index >= 0) {
      this.transfers[index] = { ...this.transfers[index], ...record };
    } else {
      this.transfers.unshift(record);
      this.transfers.splice(MAX_TRANSFERS);
    }
    this.emitState();
  }

  private emitState(): void {
    this.state.devices = Array.from(this.devices.values()).sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "online" ? -1 : 1;
      }
      if (left.trusted !== right.trusted) {
        return left.trusted ? -1 : 1;
      }
      return left.deviceName.localeCompare(right.deviceName, "zh-CN");
    });
    this.state.messages = [...this.messages];
    this.state.transfers = [...this.transfers];
    this.state.pendingPairRequests = Array.from(this.pendingPairRequests.values()).map(
      ({ address: _address, wsPort: _wsPort, ...request }) => request
    );
    this.state.networkLabel = getNetworkLabel();
    this.emit("state", this.getState());
  }
}
