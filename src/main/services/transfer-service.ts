import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { EventEmitter } from "node:events";

import { v4 as uuidv4 } from "uuid";

import type { PeerDevice, TransferRecord } from "../../shared/types";

interface TransferServiceOptions {
  httpPort: number;
  getReceiveDirectory: () => string;
  getSelfDeviceId: () => string;
  getSelfDeviceName: () => string;
}

export class TransferService extends EventEmitter {
  private readonly server: http.Server;

  private readonly options: TransferServiceOptions;

  constructor(options: TransferServiceOptions) {
    super();
    this.options = options;
    this.server = http.createServer((req, res) => this.handleIncoming(req, res));
    this.server.listen(options.httpPort, "0.0.0.0");
  }

  async sendFiles(filePaths: string[], peers: PeerDevice[]): Promise<void> {
    const jobs = peers.flatMap((peer) => filePaths.map((filePath) => this.sendSingleFile(filePath, peer)));
    await Promise.allSettled(jobs);
  }

  stop(): void {
    this.server.close();
  }

  private async sendSingleFile(filePath: string, peer: PeerDevice): Promise<void> {
    const stats = await fs.promises.stat(filePath);
    const transferId = uuidv4();
    const fileName = path.basename(filePath);

    this.emitTransfer({
      transferId,
      fileName,
      fileSize: stats.size,
      senderDeviceId: this.options.getSelfDeviceId(),
      senderDeviceName: this.options.getSelfDeviceName(),
      targetDeviceIds: [peer.deviceId],
      direction: "outgoing",
      status: "connecting",
      progress: 0,
      updatedAt: Date.now()
    });

    await new Promise<void>((resolve, reject) => {
      const request = http.request(
        {
          host: peer.address,
          port: peer.httpPort,
          path: "/upload",
          method: "POST",
          headers: {
            "content-length": stats.size,
            "content-type": "application/octet-stream",
            "x-transfer-id": transferId,
            "x-file-name": encodeURIComponent(fileName),
            "x-file-size": stats.size,
            "x-sender-device-id": this.options.getSelfDeviceId(),
            "x-sender-device-name": encodeURIComponent(this.options.getSelfDeviceName())
          }
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              this.emitTransfer({
                transferId,
                fileName,
                fileSize: stats.size,
                senderDeviceId: this.options.getSelfDeviceId(),
                senderDeviceName: this.options.getSelfDeviceName(),
                targetDeviceIds: [peer.deviceId],
                direction: "outgoing",
                status: "complete",
                progress: 1,
                updatedAt: Date.now()
              });
              resolve();
            } else {
              this.emitTransfer({
                transferId,
                fileName,
                fileSize: stats.size,
                senderDeviceId: this.options.getSelfDeviceId(),
                senderDeviceName: this.options.getSelfDeviceName(),
                targetDeviceIds: [peer.deviceId],
                direction: "outgoing",
                status: "failed",
                progress: 0,
                updatedAt: Date.now(),
                error: Buffer.concat(chunks).toString("utf8") || "远端拒绝接收"
              });
              reject(new Error("Upload failed"));
            }
          });
        }
      );

      request.on("error", (error) => {
        this.emitTransfer({
          transferId,
          fileName,
          fileSize: stats.size,
          senderDeviceId: this.options.getSelfDeviceId(),
          senderDeviceName: this.options.getSelfDeviceName(),
          targetDeviceIds: [peer.deviceId],
          direction: "outgoing",
          status: "failed",
          progress: 0,
          updatedAt: Date.now(),
          error: error.message
        });
        reject(error);
      });

      let sentBytes = 0;
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => {
        sentBytes += chunk.length;
        this.emitTransfer({
          transferId,
          fileName,
          fileSize: stats.size,
          senderDeviceId: this.options.getSelfDeviceId(),
          senderDeviceName: this.options.getSelfDeviceName(),
          targetDeviceIds: [peer.deviceId],
          direction: "outgoing",
          status: "sending",
          progress: Math.min(sentBytes / stats.size, 0.98),
          updatedAt: Date.now()
        });
      });
      stream.on("error", reject);
      stream.pipe(request);
    });
  }

  private handleIncoming(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== "POST" || req.url !== "/upload") {
      res.writeHead(404).end();
      return;
    }

    const receiveDirectory = this.options.getReceiveDirectory();
    if (!receiveDirectory) {
      res.writeHead(400).end("No receive directory configured");
      return;
    }

    const fileName = decodeURIComponent(String(req.headers["x-file-name"] ?? "unknown.bin"));
    const fileSize = Number(req.headers["x-file-size"] ?? 0);
    const transferId = String(req.headers["x-transfer-id"] ?? uuidv4());
    const senderDeviceId = String(req.headers["x-sender-device-id"] ?? "unknown");
    const senderDeviceName = decodeURIComponent(String(req.headers["x-sender-device-name"] ?? "Unknown"));

    fs.mkdirSync(receiveDirectory, { recursive: true });
    const destination = resolveUniquePath(receiveDirectory, fileName);
    const tempPath = `${destination}.part`;
    const writer = fs.createWriteStream(tempPath);

    let receivedBytes = 0;
    this.emitTransfer({
      transferId,
      fileName,
      fileSize,
      senderDeviceId,
      senderDeviceName,
      targetDeviceIds: [this.options.getSelfDeviceId()],
      direction: "incoming",
      status: "receiving",
      progress: 0,
      updatedAt: Date.now()
    });

    req.on("data", (chunk) => {
      receivedBytes += chunk.length;
      this.emitTransfer({
        transferId,
        fileName,
        fileSize,
        senderDeviceId,
        senderDeviceName,
        targetDeviceIds: [this.options.getSelfDeviceId()],
        direction: "incoming",
        status: "receiving",
        progress: fileSize > 0 ? Math.min(receivedBytes / fileSize, 0.98) : 0,
        updatedAt: Date.now()
      });
    });

    writer.on("finish", () => {
      fs.renameSync(tempPath, destination);
      this.emitTransfer({
        transferId,
        fileName,
        fileSize,
        senderDeviceId,
        senderDeviceName,
        targetDeviceIds: [this.options.getSelfDeviceId()],
        direction: "incoming",
        status: "complete",
        progress: 1,
        updatedAt: Date.now(),
        savedPath: destination
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ savedPath: destination }));
    });

    writer.on("error", (error) => {
      this.emitTransfer({
        transferId,
        fileName,
        fileSize,
        senderDeviceId,
        senderDeviceName,
        targetDeviceIds: [this.options.getSelfDeviceId()],
        direction: "incoming",
        status: "failed",
        progress: 0,
        updatedAt: Date.now(),
        error: error.message
      });
      res.writeHead(500).end(error.message);
    });

    req.pipe(writer);
  }

  private emitTransfer(record: TransferRecord): void {
    this.emit("transfer", record);
  }
}

function resolveUniquePath(dir: string, fileName: string): string {
  const extension = path.extname(fileName);
  const base = path.basename(fileName, extension);
  let candidate = path.join(dir, fileName);
  let index = 1;

  while (fs.existsSync(candidate) || fs.existsSync(`${candidate}.part`)) {
    candidate = path.join(dir, `${base} (${index})${extension}`);
    index += 1;
  }

  return candidate;
}
