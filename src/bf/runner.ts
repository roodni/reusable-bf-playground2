import { Command } from "./parser";
import type { CellType, MessageFromWorker, MessageToWorker } from "./worker";
import BfWorker from "./worker?worker";

export type Charset = "utf8" | "utf16";
export type Configs = {
  mode: Charset;
};

interface TextCodec {
  encode(s: string): number[];
  decode(a: number[]): string;
}

class Utf8Codec implements TextCodec {
  private textEncoder: TextEncoder;
  private textDecoder: TextDecoder;
  constructor() {
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder("utf-8");
  }
  encode(s: string) {
    return [...this.textEncoder.encode(s)];
  }
  decode(a: number[]) {
    return this.textDecoder.decode(new Uint8Array(a), { stream: true });
  }
}

class Utf16Codec implements TextCodec {
  encode(s: string) {
    return [...s].map((c) => c.charCodeAt(0));
  }
  decode(a: number[]): string {
    return String.fromCharCode(...a);
  }
}

export type RunnerEvent =
  | {
      t: "input";
    }
  | {
      t: "output";
      output: string;
    }
  | {
      t: "finish";
    }
  | {
      t: "error";
      kind: "pointer";
    };

export class Runner {
  private worker = new BfWorker();
  private textCodec: TextCodec;
  private isInputRequired = false;

  constructor(
    commands: Command[],
    initialInput: string,
    handler: (e: RunnerEvent) => void,
    configs: Configs,
  ) {
    let cellType: CellType;
    switch (configs.mode) {
      case "utf8":
        cellType = "uint8";
        this.textCodec = new Utf8Codec();
        break;
      case "utf16":
        cellType = "uint16";
        this.textCodec = new Utf16Codec();
        break;
    }

    this.worker.addEventListener(
      "message",
      (ev: MessageEvent<MessageFromWorker>) => {
        const msg = ev.data;
        // console.log(msg);
        switch (msg.t) {
          case "input":
            this.isInputRequired = true;
            handler({ t: "input" });
            break;
          case "output":
            handler({
              t: "output",
              output: this.textCodec.decode(msg.outputs),
            });
            this.worker.postMessage({
              t: "continue",
            } satisfies MessageToWorker);
            break;
          case "finish":
            this.worker.terminate();
            handler({ t: "finish" });
            break;
          case "error":
            this.worker.terminate();
            handler({ t: "error", kind: msg.kind });
            break;
        }
      },
    );
    this.worker.addEventListener("error", (ev) => {
      console.log("worker stopped for some reason", ev);
      this.worker.terminate();
    });
    const inputs = this.textCodec.encode(initialInput);
    const msg: MessageToWorker = {
      t: "start",
      cellType,
      commands,
      inputs,
    };
    this.worker.postMessage(msg);
  }

  input(s: string) {
    if (!this.isInputRequired) {
      throw new Error("input ignored");
    }
    const inputs = this.textCodec.encode(s);
    if (inputs.length > 0) {
      this.isInputRequired = false;
      this.worker.postMessage({
        t: "continue",
        inputs,
      } satisfies MessageToWorker);
    }
  }

  terminate() {
    this.worker.terminate();
  }
}
