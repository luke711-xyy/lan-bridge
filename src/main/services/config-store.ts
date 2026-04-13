import fs from "node:fs";
import path from "node:path";

import { app } from "electron";
import { v4 as uuidv4 } from "uuid";

import type { AppConfig } from "../../shared/types";
import { getDefaultDeviceName } from "./utils";

const DEFAULT_CONFIG: AppConfig = {
  deviceId: uuidv4(),
  deviceName: getDefaultDeviceName(),
  receiveDirectory: "",
  trustedPeers: [],
  lastSelectedTargets: [],
  preferredPorts: {
    wsPort: 39480,
    httpPort: 39481,
    udpPort: 39482
  }
};

export class ConfigStore {
  private readonly filePath: string;

  private config: AppConfig;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "config.json");
    this.config = this.loadConfig();
  }

  getSnapshot(): AppConfig {
    return structuredClone(this.config);
  }

  update(partial: Partial<AppConfig>): AppConfig {
    this.config = {
      ...this.config,
      ...partial,
      preferredPorts: {
        ...this.config.preferredPorts,
        ...(partial.preferredPorts ?? {})
      }
    };
    this.persist();
    return this.getSnapshot();
  }

  setTrustedPeer(deviceId: string, trusted: boolean): AppConfig {
    const trustedPeers = new Set(this.config.trustedPeers);

    if (trusted) {
      trustedPeers.add(deviceId);
    } else {
      trustedPeers.delete(deviceId);
    }

    return this.update({ trustedPeers: Array.from(trustedPeers) });
  }

  private loadConfig(): AppConfig {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        preferredPorts: {
          ...DEFAULT_CONFIG.preferredPorts,
          ...(parsed.preferredPorts ?? {})
        },
        trustedPeers: parsed.trustedPeers ?? [],
        lastSelectedTargets: parsed.lastSelectedTargets ?? []
      };
    } catch {
      this.persist(DEFAULT_CONFIG);
      return structuredClone(DEFAULT_CONFIG);
    }
  }

  private persist(configOverride?: AppConfig): void {
    const payload = configOverride ?? this.config;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}
