import type { OptimizedCommand } from "./optimizer";

export type MessageToWorker =
  | {
      t: "start";
      cellType: "uint8" | "uint16";
      commands: OptimizedCommand[];
      inputs: number[];
      arrayLength: number;
      disableWrapAround: boolean;
    }
  | {
      t: "continue";
      inputs?: number[];
    };

export type MessageFromWorker =
  | {
      t: "input";
    }
  | {
      t: "output";
      outputs: number[];
    }
  | {
      t: "finish";
    }
  | {
      t: "error";
      kind: "pointer" | "overflow";
    };

type Stacked = {
  index: number;
  commands: OptimizedCommand[];
};
let stack: Stacked[];

let tape: number[];
let ptr: number;

let inputs: number[];
let inputIndex: number;

let bitMask: number;
let disableWrapAround: boolean;

self.addEventListener("message", (event: MessageEvent<MessageToWorker>) => {
  const message = event.data;
  // console.log(message);
  if (message.t === "start") {
    stack = [{ index: 0, commands: message.commands }];
    tape = new Array(message.arrayLength).fill(0);
    switch (message.cellType) {
      case "uint8":
        // tape = new Uint8Array(message.arrayLength);
        bitMask = 0xff;
        break;
      case "uint16":
        bitMask = 0xffff;
        // tape = new Uint16Array(message.arrayLength);
        break;
      default:
        throw new Error("never");
    }
    ptr = 0;
    inputs = message.inputs;
    inputIndex = 0;
    disableWrapAround = message.disableWrapAround;
    run();
  } else if (message.t === "continue") {
    if (message.inputs) {
      if (inputIndex !== inputs.length) {
        throw new Error("unexpected input");
      }
      inputs = message.inputs;
      inputIndex = 0;
    }
    run();
  }
});

function post(message: MessageFromWorker) {
  self.postMessage(message);
}

function run() {
  let stacked = stack[stack.length - 1];
  while (true) {
    while (stacked.index === stacked.commands.length) {
      if (stack.length === 1) {
        post({ t: "finish" });
        return;
      } else if (tape[ptr] !== 0) {
        stacked.index = 0;
      } else {
        stack.pop();
        stacked = stack[stack.length - 1];
      }
    }

    const command: OptimizedCommand = stacked.commands[stacked.index];
    switch (command.t) {
      case "add": {
        const a = tape[ptr] + command.n;
        const b = a & bitMask;
        if (disableWrapAround && a !== b) {
          post({ t: "error", kind: "overflow" });
          return;
        }
        tape[ptr] = b;
        stacked.index++;
        break;
      }
      case "shift":
        ptr += command.n;
        if (ptr < 0 || tape.length <= ptr) {
          post({ t: "error", kind: "pointer" });
          return;
        }
        stacked.index++;
        break;
      case "output":
        // 出力を一方的に送り付けるのではなく、メインスレッドからの返事を待機する
        stacked.index++;
        post({ t: "output", outputs: [tape[ptr]] });
        return;
      case "input":
        if (inputIndex < inputs.length) {
          tape[ptr] = inputs[inputIndex];
          inputIndex++;
          stacked.index++;
        } else {
          post({ t: "input" });
          return;
        }
        break;
      case "loop":
        if (tape[ptr] !== 0) {
          stacked.index++;
          stacked = { index: 0, commands: command.commands };
          stack.push(stacked);
        } else {
          stacked.index++;
        }
        break;
      case "move": {
        const n = tape[ptr];
        if (n !== 0) {
          for (let i = 0; i < command.dest.length; i++) {
            const { index, coef } = command.dest[i];
            const p = ptr + index;
            if (p < 0 || tape.length <= p) {
              post({ t: "error", kind: "pointer" });
              return;
            }
            tape[p] += n * coef;
          }
          tape[ptr] = 0;
        }
        stacked.index++;
        break;
      }
    }
  }
}
