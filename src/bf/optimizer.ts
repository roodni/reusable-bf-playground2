import { Command } from "./parser";

export type OptimizedCommand =
  | Exclude<Command, { t: "loop" }>
  | { t: "loop"; commands: OptimizedCommand[] }
  | { t: "move"; dest: { index: number; coef: number }[] };

export function optimize(commands: Command[]): OptimizedCommand[] {
  const convert = (command: Command): OptimizedCommand => {
    switch (command.t) {
      case "add":
      case "shift":
      case "output":
      case "input":
        return command;
      case "loop": {
        const coefs = new Map<number, number>();
        let pointer = 0;
        for (const c of command.commands) {
          if (c.t === "add") {
            coefs.set(pointer, (coefs.get(pointer) ?? 0) + c.n);
          } else if (c.t === "shift") {
            pointer += c.n;
          } else {
            pointer = NaN;
            break;
          }
        }
        if (pointer === 0 && coefs.get(0) === -1) {
          coefs.delete(0);
          return {
            t: "move",
            dest: [...coefs.entries()].map(([index, coef]) => ({
              index,
              coef,
            })),
          };
        }
        return {
          t: "loop",
          commands: optimize(command.commands),
        };
      }
    }
  };
  return commands.map(convert);
}
