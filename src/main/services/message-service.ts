import { EventEmitter } from "node:events";

import WebSocket, { WebSocketServer } from "ws";

import type { DiscoveryBroadcast, SocketEnvelope, TextMessage } from "../../shared/types";
import { normalizeRemoteAddress } from "./utils";

interface MessageServiceOptions {
  wsPort: number;
  selfDescriptor: () => DiscoveryBroadcast;
  onPeerResolved: (payload: DiscoveryBroadcast, address: string) => void;
}

type PairRequestEvent = Extract<SocketEnvelope, { type: "pair_request" }>;
type PairResponseEvent = Extract<SocketEnvelope, { type: "pair_response" }>;
type TextMessageEvent = Extract<SocketEnvelope, { type: "text_message" }>;

export class MessageService extends EventEmitter {
  private readonly server: WebSocketServer;

  private readonly sockets = new Map<string, WebSocket>();

  private readonly options: MessageServiceOptions;

  constructor(options: MessageServiceOptions) {
    super();
    this.options = options;
    this.server = new WebSocketServer({ port: options.wsPort });
    this.server.on("connection", (socket, request) => {
      const remoteAddress = normalizeRemoteAddress(request.socket.remoteAddress ?? "");
      this.attachSocket(socket, remoteAddress);
      socket.send(JSON.stringify({ type: "hello", payload: this.options.selfDescriptor() } satisfies SocketEnvelope));
    });
  }

  async sendPairRequest(address: string, wsPort: number, requestId: string, enteredCode: string): Promise<void> {
    const socket = await this.ensureSocket(address, wsPort);
    socket.send(
      JSON.stringify({
        type: "pair_request",
        payload: {
          requestId,
          enteredCode,
          from: this.options.selfDescriptor()
        }
      } satisfies SocketEnvelope)
    );
  }

  async sendPairResponse(
    address: string,
    wsPort: number,
    requestId: string,
    accepted: boolean,
    reason?: string
  ): Promise<void> {
    const socket = await this.ensureSocket(address, wsPort);
    socket.send(
      JSON.stringify({
        type: "pair_response",
        payload: {
          requestId,
          accepted,
          reason,
          responderId: this.options.selfDescriptor().deviceId
        }
      } satisfies SocketEnvelope)
    );
  }

  async sendText(address: string, wsPort: number, message: TextMessage): Promise<void> {
    const socket = await this.ensureSocket(address, wsPort);
    socket.send(JSON.stringify({ type: "text_message", payload: message } satisfies SocketEnvelope));
  }

  stop(): void {
    this.server.close();
    for (const socket of this.sockets.values()) {
      socket.close();
    }
    this.sockets.clear();
  }

  private async ensureSocket(address: string, wsPort: number): Promise<WebSocket> {
    const key = `${address}:${wsPort}`;
    const existing = this.sockets.get(key);
    if (existing && existing.readyState === WebSocket.OPEN) {
      return existing;
    }

    return await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`ws://${address}:${wsPort}`);
      const handleError = (error: Error) => reject(error);
      socket.once("error", handleError);
      socket.once("open", () => {
        socket.off("error", handleError);
        this.attachSocket(socket, address);
        socket.send(JSON.stringify({ type: "hello", payload: this.options.selfDescriptor() } satisfies SocketEnvelope));
        resolve(socket);
      });
    });
  }

  private attachSocket(socket: WebSocket, fallbackAddress: string): void {
    socket.on("message", (buffer) => {
      try {
        const envelope = JSON.parse(buffer.toString()) as SocketEnvelope;
        if (envelope.type === "hello") {
          this.handleHello(envelope.payload, socket, fallbackAddress);
          return;
        }

        if (envelope.type === "pair_request") {
          this.emit("pair-request", envelope as PairRequestEvent, fallbackAddress);
          return;
        }

        if (envelope.type === "pair_response") {
          this.emit("pair-response", envelope as PairResponseEvent, fallbackAddress);
          return;
        }

        if (envelope.type === "text_message") {
          this.emit("text-message", envelope as TextMessageEvent, fallbackAddress);
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on("close", () => {
      for (const [key, candidate] of this.sockets.entries()) {
        if (candidate === socket) {
          this.sockets.delete(key);
        }
      }
    });
  }

  private handleHello(payload: DiscoveryBroadcast, socket: WebSocket, fallbackAddress: string): void {
    this.sockets.set(`${fallbackAddress}:${payload.wsPort}`, socket);
    this.options.onPeerResolved(payload, fallbackAddress);
  }
}
