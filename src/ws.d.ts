declare module "ws" {
  export class WebSocket {
    constructor(url: string);
    on(event: string, cb: (...args: any[]) => void): void;
    send(data: string): void;
    close(): void;
  }
}
