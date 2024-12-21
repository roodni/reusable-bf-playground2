import type { Command } from "./parser";

export type CellType = "uint8" | "uint16";
export type MessageToWorker =
  | {
      t: "start";
      cellType: CellType;
      commands: Command[];
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
  commands: Command[];
};
let stack: Stacked[];

const TapeSize = 100000;
let tape: Uint8Array | Uint16Array;
let ptr: number;

let inputs: number[];
let inputIndex: number;

addEventListener("message", (event: MessageEvent<MessageToWorker>) => {
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
  postMessage(message);
}

function run() {
  while (true) {
    const stacked = stack.at(-1);
    if (!stacked) {
      postMessage({ t: "finish" });
      return;
    }

    if (stacked.index === stacked.commands.length) {
      if (tape[ptr] === 0 || stack.length === 1) {
        stack.pop();
      } else {
        stacked.index = 0;
      }
      continue;
    }

    const command = stacked.commands[stacked.index];
    if (command.t === "add") {
      tape[ptr] += command.n;
      stacked.index++;
    } else if (command.t === "shift") {
      ptr += command.n;
      if (ptr < 0 || tape.length <= ptr) {
        post({ t: "error", kind: "pointer" });
        return;
      }
      stacked.index++;
    } else if (command.t === "loop") {
      if (tape[ptr] !== 0) {
        stack.push({ index: 0, commands: command.commands });
      }
      stacked.index++;
    } else if (command.t === "output") {
      post({ t: "output", outputs: [tape[ptr]] });
      stacked.index++;
      return; // 出力を一方的に送り付けるのではなく、メインスレッドからの返事を待機する
    } else if (command.t === "input") {
      if (inputIndex < inputs.length) {
        tape[ptr] = inputs[inputIndex];
        inputIndex++;
        stacked.index++;
      } else {
        post({ t: "input" });
        return;
      }
    }
  }
}
