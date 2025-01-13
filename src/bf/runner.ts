import type { OptimizedCommand } from "./optimizer";
import type { MessageFromWorker, MessageToWorker } from "./worker";
import BfWorker from "./worker?worker";

export type CellType = "uint8" | "uint16";

export type Configs = {
  cellType: CellType;
  arrayLength: number;
  encoding: new () => TextCodec;
  disableWrapAround: boolean;
};

export interface TextCodec {
  encode(s: string): number[];
  decode(a: number[]): string;
}

export class Utf8Codec implements TextCodec {
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

export class Utf16Codec implements TextCodec {
  encode(s: string) {
    const l = [];
    for (let i = 0; i < s.length; i++) {
      l.push(s.charCodeAt(i));
    }
    return l;
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
      kind: "pointer" | "overflow" | "fatal";
    };

type RunnerState = Readonly<
  | { t: "initial"; workerLoadFailed: boolean }
  | { t: "running"; textCodec: TextCodec; handler: (e: RunnerEvent) => void }
  | { t: "terminated" }
>;

export class Runner {
  private state: RunnerState = { t: "initial", workerLoadFailed: false };
  private worker: Worker;

  constructor() {
    this.worker = new BfWorker();
    this.worker.addEventListener("error", (ev) => {
      // 初期化時にワーカーでエラーが起きたらフラグを立てる。通信エラーを想定している
      // そのときは run のタイミングで再度ワーカーの起動を試行する
      // 軽量なので別に事前に読み込んでおく必要はないんだが、まあそういうことしたくなる気分のときもある
      if (this.state.t === "initial") {
        console.log("Failed to load worker", ev);
        this.worker.terminate();
        this.state = { t: "initial", workerLoadFailed: true };
      }
    });
  }

  run(
    commands: OptimizedCommand[],
    initialInput: string,
    handler: (e: RunnerEvent) => void,
    configs: Configs,
  ) {
    if (this.state.t !== "initial") {
      throw new Error(`Unexpected run (state = ${this.state.t})`);
    }
    if (this.state.workerLoadFailed) {
      console.log("Reload worker");
      this.worker = new BfWorker();
    }

    const textCodec = new configs.encoding();
    this.state = { t: "running", textCodec, handler };

    const terminate = () => {
      this.worker.terminate();
      this.state = { t: "terminated" };
    };

    this.worker.addEventListener(
      "message",
      (ev: MessageEvent<MessageFromWorker>) => {
        const msg = ev.data;
        // console.log(msg);
        switch (msg.t) {
          case "input":
            handler({ t: "input" });
            break;
          case "output":
            handler({
              t: "output",
              output: textCodec.decode(msg.outputs),
            });
            this.worker.postMessage({
              t: "continue",
            } satisfies MessageToWorker);
            break;
          case "finish":
            terminate();
            handler({ t: "finish" });
            break;
          case "error":
            terminate();
            handler({ t: "error", kind: msg.kind });
            break;
        }
      },
    );

    this.worker.addEventListener("error", (ev) => {
      terminate();
      console.log("Worker stopped for some reason", ev);
      handler({ t: "error", kind: "fatal" });
    });

    const msg: MessageToWorker = {
      t: "start",
      cellType: configs.cellType,
      commands,
      inputs: textCodec.encode(initialInput),
      arrayLength: configs.arrayLength,
      disableWrapAround: configs.disableWrapAround,
    };
    this.worker.postMessage(msg);
  }

  input(s: string) {
    if (this.state.t !== "running") {
      throw new Error(`Unexpected input (state = ${this.state.t})`);
    }
    const inputs = this.state.textCodec.encode(s);
    this.worker.postMessage({
      t: "continue",
      inputs,
    } satisfies MessageToWorker);
  }

  abort() {
    if (this.state.t !== "running") {
      throw new Error(`Unexpected abort (state = ${this.state.t})`);
    }
    this.worker.terminate();
    this.state = { t: "terminated" };
  }
}
