import type { ZoneEvent } from "./types";

type EventHandler = (event: ZoneEvent) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private getUrl: (() => string) | null = null;

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  connect(getUrl: () => string) {
    if (this.ws && this.ws.readyState < 2 && this.getUrl === getUrl) return;
    this.disconnect();
    this.getUrl = getUrl;
    this.destroyed = false;
    this._open();
  }

  private _open() {
    if (!this.getUrl || this.destroyed) return;
    const url = this.getUrl();
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      wsStatus.emit("connected");
    };

    ws.onclose = () => {
      wsStatus.emit("disconnected");
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => {
          wsStatus.emit("reconnecting");
          this._open();
        }, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as ZoneEvent;
        for (const h of this.handlers) h(event);
      } catch {
      }
    };
  }

  disconnect() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.getUrl = null;
  }
}

type StatusType = "connected" | "disconnected" | "reconnecting" | "idle";

class WsStatus {
  private status: StatusType = "idle";
  private listeners = new Set<(s: StatusType) => void>();

  emit(s: StatusType) {
    this.status = s;
    for (const l of this.listeners) l(s);
  }

  get() {
    return this.status;
  }

  subscribe(l: (s: StatusType) => void): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
}

export const wsClient = new WsClient();
export const wsStatus = new WsStatus();
export type { StatusType };
