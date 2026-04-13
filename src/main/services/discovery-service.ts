import dgram from "node:dgram";
import os from "node:os";

import { Bonjour } from "bonjour-service";

import type { DiscoveryBroadcast } from "../../shared/types";

interface DiscoveryServiceOptions {
  selfDescriptor: () => DiscoveryBroadcast;
  udpPort: number;
  onPeerSeen: (payload: DiscoveryBroadcast, address: string, source: "udp" | "mdns") => void;
}

export class DiscoveryService {
  private readonly bonjour = new Bonjour();

  private readonly socket = dgram.createSocket("udp4");

  private readonly options: DiscoveryServiceOptions;

  private publishTimer?: NodeJS.Timeout;

  private browserStop?: () => void;

  constructor(options: DiscoveryServiceOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    await this.startUdp();
    this.startBonjour();
  }

  stop(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
    }
    this.browserStop?.();
    this.bonjour.unpublishAll(() => {
      this.bonjour.destroy();
    });
    this.socket.close();
  }

  private async startUdp(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.bind(this.options.udpPort, "0.0.0.0", () => {
        this.socket.setBroadcast(true);
        this.socket.off("error", reject);
        resolve();
      });
    });

    this.socket.on("message", (buffer, remoteInfo) => {
      try {
        const payload = JSON.parse(buffer.toString("utf8")) as DiscoveryBroadcast;
        if (payload.protocol !== "lan-bridge") {
          return;
        }

        this.options.onPeerSeen(payload, remoteInfo.address, "udp");
      } catch {
        // ignore malformed packets
      }
    });

    this.publishUdp();
    this.publishTimer = setInterval(() => this.publishUdp(), 4_000);
  }

  private publishUdp(): void {
    const payload = Buffer.from(JSON.stringify(this.options.selfDescriptor()), "utf8");
    this.socket.send(payload, this.options.udpPort, "255.255.255.255");
  }

  private startBonjour(): void {
    const descriptor = this.options.selfDescriptor();
    this.bonjour.publish({
      name: `lan-bridge-${descriptor.deviceId}`,
      type: "lanbridge",
      port: descriptor.wsPort,
      txt: {
        deviceId: descriptor.deviceId,
        deviceName: descriptor.deviceName,
        httpPort: String(descriptor.httpPort),
        platform: descriptor.platform
      }
    });

    const browser = this.bonjour.find({ type: "lanbridge" }, (service) => {
      const addresses = service.addresses ?? [];
      const address = addresses.find((item) => item.includes(".")) ?? service.referer?.address;
      if (!address) {
        return;
      }

      const txt = service.txt as Record<string, string | undefined>;
      this.options.onPeerSeen(
        {
          protocol: "lan-bridge",
          version: 1,
          deviceId: txt.deviceId ?? "",
          deviceName: txt.deviceName ?? service.name,
          wsPort: service.port,
          httpPort: Number(txt.httpPort ?? service.port + 1),
          platform: (txt.platform as DiscoveryBroadcast["platform"]) ?? detectBonjourPlatform(),
          timestamp: Date.now()
        },
        address,
        "mdns"
      );
    });

    this.browserStop = () => browser.stop();
  }
}

function detectBonjourPlatform(): DiscoveryBroadcast["platform"] {
  const current = os.platform();
  if (current === "darwin") {
    return "macos";
  }
  if (current === "win32") {
    return "windows";
  }
  return "linux";
}
