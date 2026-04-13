import net from "node:net";
import os from "node:os";
import { platform } from "node:process";

import type { PlatformKind } from "../../shared/types";

export function detectPlatform(): PlatformKind {
  if (platform === "darwin") {
    return "macos";
  }

  if (platform === "win32") {
    return "windows";
  }

  return "linux";
}

export function generatePairingCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function getDefaultDeviceName(): string {
  const host = os.hostname();
  return host.length > 24 ? host.slice(0, 24) : host;
}

export async function findAvailablePort(startPort: number): Promise<number> {
  let candidate = startPort;

  while (candidate < startPort + 50) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(candidate, "0.0.0.0");
    });

    if (isOpen) {
      return candidate;
    }

    candidate += 1;
  }

  throw new Error(`No available port found near ${startPort}`);
}

export function getNetworkLabel(): string {
  const interfaces = os.networkInterfaces();
  const ipv4 = Object.values(interfaces)
    .flat()
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .find((entry) => entry.family === "IPv4" && !entry.internal);

  return ipv4?.address ?? "未接入局域网";
}

export function normalizeRemoteAddress(address: string): string {
  if (address.startsWith("::ffff:")) {
    return address.replace("::ffff:", "");
  }

  return address;
}
