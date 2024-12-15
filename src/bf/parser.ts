export type Command =
  | { t: "add"; n: number }
  | { t: "shift"; n: number }
  | { t: "output" }
  | { t: "input" }
  | { t: "loop"; commands: Command[] };

export type ParseResult =
  | { t: "succeed"; commands: Command[] }
  | { t: "error"; msg: string; line: number; col: number };

export function parse(code: string): ParseResult {
  type Stack = {
    commands: Command[];
    loopBegin: { line: number; col: number } | undefined;
  };
  const stack: Stack[] = [{ commands: [], loopBegin: undefined }];
  let line = 1;
  let col = 1;
  for (const c of code) {
    const { commands } = stack.at(-1)!;
    const lastCommand = commands.at(-1);

    switch (c) {
      case "+":
      case "-": {
        const sign = c === "+" ? 1 : -1;
        if (lastCommand?.t === "add") {
          lastCommand.n += sign;
        } else {
          commands.push({ t: "add", n: sign });
        }
        break;
      }
      case ">":
      case "<": {
        const sign = c === ">" ? 1 : -1;
        if (lastCommand?.t === "shift") {
          lastCommand.n += sign;
        } else {
          commands.push({ t: "shift", n: sign });
        }
        break;
      }
      case ".":
        commands.push({ t: "output" });
        break;
      case ",":
        commands.push({ t: "input" });
        break;
      case "[":
        stack.push({ commands: [], loopBegin: { line, col } });
        break;
      case "]": {
        stack.pop();
        const parent = stack.at(-1);
        if (!parent) {
          return {
            t: "error",
            msg: "Unmatched ']'",
            line,
            col,
          };
        }
        parent.commands.push({ t: "loop", commands });
        break;
      }
    }

    if (c === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }

  const s = stack.at(-1)!;
  if (s.loopBegin) {
    return {
      t: "error",
      msg: `Unmatched '['`,
      line: s.loopBegin.line,
      col: s.loopBegin.col,
    };
  }
  return { t: "succeed", commands: s.commands };
}
