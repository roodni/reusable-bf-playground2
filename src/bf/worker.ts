import type { OptimizedCommand } from "./optimizer";

export type CellType = "uint8" | "uint16";
export type MessageToWorker =
  | {
      t: "start";
      cellType: CellType;
      commands: OptimizedCommand[];
      inputs: number[];
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
      kind: "pointer";
    };

type Stacked = {
  index: number;
  commands: OptimizedCommand[];
};
let stack: Stacked[];

const TapeSize = 100000;
let tape: Uint8Array | Uint16Array;
let ptr: number;

let inputs: number[];
let inputIndex: number;

self.addEventListener("message", (event: MessageEvent<MessageToWorker>) => {
  const message = event.data;
  // console.log(message);
  if (message.t === "start") {
    stack = [{ index: 0, commands: message.commands }];
    switch (message.cellType) {
      case "uint8":
        tape = new Uint8Array(TapeSize);
        break;
      case "uint16":
        tape = new Uint16Array(TapeSize);
        break;
    }
    ptr = 0;
    inputs = message.inputs;
    inputIndex = 0;
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
      case "add":
        tape[ptr] += command.n;
        stacked.index++;
        break;
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
          for (const { index, coef } of command.dest) {
            const i = ptr + index;
            if (i < 0 || tape.length <= i) {
              post({ t: "error", kind: "pointer" });
              return;
            }
            tape[i] += n * coef;
          }
          tape[ptr] = 0;
        }
        stacked.index++;
        break;
      }
    }
  }
}
