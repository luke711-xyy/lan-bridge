import { startTransition, useEffect, useMemo, useState } from "react";

import {
  Airplay,
  ArrowUpFromLine,
  CheckCheck,
  FolderOpen,
  MonitorSmartphone,
  RefreshCw,
  SendHorizonal
} from "lucide-react";

import type { AppState, PeerDevice } from "../shared/types";

const emptyState: AppState = {
  self: {
    deviceId: "",
    deviceName: "",
    platform: "windows",
    wsPort: 0,
    httpPort: 0,
    pairingCode: "------"
  },
  receiveDirectory: "",
  networkLabel: "检测中",
  devices: [],
  messages: [],
  transfers: [],
  pendingPairRequests: [],
  lastSelectedTargets: []
};

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [pairingDevice, setPairingDevice] = useState<PeerDevice | null>(null);
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    void window.bridge.getAppState().then((nextState) => {
      if (!mounted || !nextState) {
        return;
      }
      setState(nextState);
      setSelectedTargets(nextState.lastSelectedTargets);
    });

    const unsubscribe = window.bridge.onStateChanged((nextState) => {
      startTransition(() => {
        setState(nextState);
        setSelectedTargets((current) =>
          current.length > 0 ? current.filter((id) => nextState.devices.some((device) => device.deviceId === id)) : nextState.lastSelectedTargets
        );
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const trustedDevices = useMemo(
    () => state.devices.filter((device) => device.trusted && device.status === "online"),
    [state.devices]
  );

  const canSend = selectedTargets.length > 0 && trustedDevices.length > 0;

  async function handleSendText() {
    if (!draft.trim()) {
      return;
    }

    try {
      setSending(true);
      setError("");
      await window.bridge.sendText(draft, selectedTargets);
      setDraft("");
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSending(false);
    }
  }

  async function handleSendFiles(paths: string[]) {
    if (paths.length === 0) {
      setError("没有拿到可发送的本地文件路径，请改用“选择文件”按钮或检查拖拽来源。");
      return;
    }
    try {
      setSending(true);
      setError("");
      await window.bridge.sendFiles(paths, selectedTargets);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSending(false);
    }
  }

  function toggleTarget(deviceId: string) {
    setSelectedTargets((current) =>
      current.includes(deviceId) ? current.filter((id) => id !== deviceId) : [...current, deviceId]
    );
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="hero-card glass">
        <div>
          <p className="eyebrow">Lan Bridge</p>
          <h1>局域网文字与文件瞬时互传</h1>
          <p className="hero-copy">
            设备发现、配对确认、消息发送和文件落盘都在同一个窗口完成。当前地址
            <span>{state.networkLabel}</span>
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-chip">
            <MonitorSmartphone size={16} />
            <span>{state.self.deviceName || "当前设备"}</span>
          </div>
          <div className="meta-chip subtle">
            <RefreshCw size={16} />
            <span>配对码 {state.self.pairingCode}</span>
          </div>
        </div>
      </header>

      <main className="grid-layout">
        <section className="surface glass upload-panel">
          <div className="section-head">
            <div>
              <p className="section-kicker">Drop Zone</p>
              <h2>选择要发出的内容</h2>
            </div>
            <button className="icon-button" onClick={() => void window.bridge.chooseReceiveDirectory()}>
              <FolderOpen size={18} />
              <span>接收目录</span>
            </button>
          </div>

          <DropBoard onFiles={handleSendFiles} disabled={!canSend || sending} />

          <div className="receive-bar">
            <div>
              <span className="label">接收文件夹</span>
              <strong>{state.receiveDirectory || "尚未设置，请先选择一个目录"}</strong>
            </div>
            <div className="receive-actions">
              <button className="secondary-button" onClick={() => void window.bridge.chooseReceiveDirectory()}>
                更改
              </button>
              <button
                className="secondary-button"
                disabled={!state.receiveDirectory}
                onClick={() => void window.bridge.openReceiveDirectory()}
              >
                打开
              </button>
            </div>
          </div>

          <div className="composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="输入要发送给已勾选设备的文字。"
            />
            <button className="primary-button" disabled={!canSend || !draft.trim() || sending} onClick={() => void handleSendText()}>
              <SendHorizonal size={17} />
              <span>{sending ? "发送中..." : "发送文字"}</span>
            </button>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}
        </section>

        <section className="surface glass devices-panel">
          <div className="section-head compact">
            <div>
              <p className="section-kicker">Targets</p>
              <h2>设备勾选区</h2>
            </div>
            <div className="chip-count">{state.devices.length} 台设备</div>
          </div>

          <div className="device-list">
            {state.devices.map((device) => {
              const selected = selectedTargets.includes(device.deviceId);
              return (
                <div className={`device-card ${selected ? "selected" : ""}`} key={device.deviceId}>
                  <label className="device-select">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!device.trusted || device.status !== "online"}
                      onChange={() => toggleTarget(device.deviceId)}
                    />
                    <div className="device-copy">
                      <div className="device-title-row">
                        <strong>{device.deviceName}</strong>
                        <span className={`status-dot ${device.status}`}>{device.status === "online" ? "在线" : "最近离线"}</span>
                      </div>
                      <span className="device-subline">
                        {device.platform} · {device.address}:{device.httpPort}
                      </span>
                    </div>
                  </label>

                  {device.trusted ? (
                    <div className="paired-badge">
                      <CheckCheck size={14} />
                      已配对
                    </div>
                  ) : (
                    <button className="pair-button" onClick={() => setPairingDevice(device)}>
                      配对
                    </button>
                  )}
                </div>
              );
            })}

            {state.devices.length === 0 ? (
              <div className="empty-state">
                <Airplay size={24} />
                <p>正在监听局域网设备广播，另一台机器启动后会自动出现在这里。</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="surface glass timeline-panel">
          <div className="section-head compact">
            <div>
              <p className="section-kicker">Live Feed</p>
              <h2>消息与传输状态</h2>
            </div>
          </div>

          <div className="timeline-grid">
            <div className="timeline-column">
              <h3>文字</h3>
              <div className="timeline-scroll">
                {state.messages.map((message) => (
                  <div className="timeline-item" key={message.messageId}>
                    <div className="timeline-topline">
                      <span>{message.direction === "incoming" ? `来自 ${message.senderDeviceName}` : "你发送的文字"}</span>
                      <time>{formatTime(message.timestamp)}</time>
                    </div>
                    <p>{message.text}</p>
                  </div>
                ))}
                {state.messages.length === 0 ? <p className="timeline-empty">还没有发送记录。</p> : null}
              </div>
            </div>

            <div className="timeline-column">
              <h3>文件</h3>
              <div className="timeline-scroll">
                {state.transfers.map((transfer) => (
                  <div className="timeline-item" key={transfer.transferId}>
                    <div className="timeline-topline">
                      <span>{transfer.fileName}</span>
                      <time>{formatTime(transfer.updatedAt)}</time>
                    </div>
                    <p>
                      {transfer.direction === "incoming" ? `接收自 ${transfer.senderDeviceName}` : `发送到 ${transfer.targetDeviceIds.length} 台设备`}
                    </p>
                    <div className="progress-rail">
                      <div className="progress-fill" style={{ width: `${Math.round(transfer.progress * 100)}%` }} />
                    </div>
                    <div className="timeline-bottom">
                      <span>{renderTransferLabel(transfer.status)}</span>
                      <span>{Math.round(transfer.progress * 100)}%</span>
                    </div>
                    {transfer.savedPath ? <code>{transfer.savedPath}</code> : null}
                    {transfer.error ? <span className="error-text">{transfer.error}</span> : null}
                  </div>
                ))}
                {state.transfers.length === 0 ? <p className="timeline-empty">还没有文件传输。</p> : null}
              </div>
            </div>
          </div>
        </section>
      </main>

      {pairingDevice ? (
        <div className="modal-backdrop">
          <div className="modal-card glass">
            <p className="section-kicker">Pair Device</p>
            <h3>为 {pairingDevice.deviceName} 输入对端配对码</h3>
            <p className="modal-copy">去对方设备顶部查看六位配对码，输入后发起一次人工确认。</p>
            <input
              className="code-input"
              value={pairingCodeInput}
              onChange={(event) => setPairingCodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="六位数字"
            />
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  setPairingDevice(null);
                  setPairingCodeInput("");
                }}
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={pairingCodeInput.length !== 6}
                onClick={async () => {
                  try {
                    await window.bridge.requestPairing(pairingDevice.deviceId, pairingCodeInput);
                    setPairingDevice(null);
                    setPairingCodeInput("");
                  } catch (nextError) {
                    setError(getErrorMessage(nextError));
                  }
                }}
              >
                发起配对
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {state.pendingPairRequests.map((request) => (
        <div className="toast glass" key={request.requestId}>
          <p>{request.fromDeviceName} 请求与你建立可信连接</p>
          <div className="toast-actions">
            <button className="secondary-button" onClick={() => void window.bridge.respondToPairRequest(request.requestId, false)}>
              拒绝
            </button>
            <button className="primary-button" onClick={() => void window.bridge.respondToPairRequest(request.requestId, true)}>
              接受
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DropBoard({
  disabled,
  onFiles
}: {
  disabled: boolean;
  onFiles: (paths: string[]) => void;
}) {
  const [active, setActive] = useState(false);

  function extractPaths(files: FileList | File[]) {
    return window.bridge.resolveFilePaths(files);
  }

  return (
    <div
      className={`drop-board ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setActive(true);
        }
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setActive(false);
        if (disabled) {
          return;
        }
        const paths = extractPaths(event.dataTransfer.files);
        void onFiles(paths);
      }}
    >
      <ArrowUpFromLine size={22} />
      <strong>点击选择文件，或直接拖入这里</strong>
      <p>文件会发给右侧已勾选且已配对的设备，接收端自动保存到设定目录。</p>
      <button
        className="file-picker"
        type="button"
        onClick={async () => {
          const paths = await window.bridge.chooseFiles();
          void onFiles(paths);
        }}
      >
        选择文件
      </button>
    </div>
  );
}

function renderTransferLabel(status: AppState["transfers"][number]["status"]): string {
  switch (status) {
    case "queued":
      return "排队中";
    case "connecting":
      return "建立连接";
    case "sending":
      return "发送中";
    case "receiving":
      return "接收中";
    case "complete":
      return "完成";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "操作失败，请稍后重试。";
}
