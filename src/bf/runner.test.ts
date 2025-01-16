import "@vitest/web-worker";
import { describe, expect, test } from "vitest";
import { optimize } from "./optimizer";
import { parse } from "./parser";
import {
  CellType,
  Runner,
  RunnerEvent,
  TextCodec,
  Utf16Codec,
  Utf8Codec,
} from "./runner";

type TestCase = {
  label: string;
  code: string;
  runs: {
    i?: string;
    o: string;
    cellType?: CellType;
    encoding?: new () => TextCodec;
  }[];
};

const testCases: TestCase[] = [
  {
    label: "Hello World!",
    code: "+++++++++[->++++++++<]>.<+++++++[->++++<]>+.+++++++..+++.<++++++++>[-]<[->++++<]>.<+++++++++++[->+++++<]>.<++++++[->++++<]>.+++.------.--------.<++++++++>[-]<[->++++<]>+.[-]++++++++++.[-]",
    runs: [{ o: "Hello World!\n" }],
  },
  {
    label: "FizzBuzz",
    code: ">>>>>>>>>>>>>>>++++++++++<<<<<<<<<<<<,----------[-------------------------------------->[-<++++++++++>]<[->+<],----------]+++<<<+++++>>>>[->>>>>>>>>>[>>>>>]+[>>+<[>-]>[-<++++++++++>>]<<->+<[>-<<[-<<<<<]>>]>[-<++++++++++>>>>+>>>]<<<][<<<<<]<<<<++<<-<+>[<->>>-<<<]<[->+++>>>>>++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.+++++++++++++++++++++++++++++++++++.+++++++++++++++++..[-]<<<<<<<]<->+<[>->>>>-<<<<]>[-<+++++>>>>>>>>++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.+++++++++++++++++++++++++++++++++++++++++++++++++++.+++++..[-]<<<<<<]>>>>+<[>-]>[->>>>>>>>[>>>>>]>[<+>>>>>>]<<<<<[>>>++++++++++++++++++++++++++++++++++++++++++++++++++++++++++<<<[->>>-<<<]>>>.<<<++++++++++++++++++++++++++++++++++++++++++++++++++++++++++>>>[-<<<->>>]<<<<-<<<<]<[<<<<<]<<]<<[-]++++++++++++++++++++++++++++++++.[-]<]",
    runs: [
      {
        i: "16\n",
        o: "1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz 16 ",
      },
    ],
  },
  {
    label: "switch",
    code: ",>>>+++++++++++++++++++++++++++++++++++++++++++>+<[-<<+<[>-<->]>[->>>-<[-]<]>]<<+<[>->>>-<<<]>[->]>>>+<[->-<<+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.+++++.-----------.[-]>]>[-<<+>+<[-<<+<[>-<->]>[->>>-<<]>]<<+<[>->>>-<<<]>[->]>>>+<[->-<<+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.--.+++++++++++++++.[-]>]>[-<<+>+<[-<<+<[>-<->]>[->>>-<<]>]<<+<[>->>>-<<<]>[->]>>>+<[->-<<++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.+.--.[-]>]>[-<<+>+<[-<<+<[>-<->]>[->>>-<<]>]<<+<[>->>>-<<<]>[->]>>>+<[->-<<++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.+++++.-.[-]>]>[-<<++++++++++++++>+<[-<<+<[>-<->]>[->>>-<[-]<]>]<<+<[>->>>-<<<]>[->]>>>+<[->-<<+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.-----------.++++.[-]>]>[-<<++>+<[-<<+<[>-<->]>[->>>-<[-]<]>]<<+<[>->>>-<<<]>[->]>>>+<[->-<<+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.-----------.++++++++++.[-]>]>[-<<+++++++++++++++++++++++++++++>+<[-<<+<[>-<->]>[->>>-<[-]<]>]<<+<[>->>>-<<<]>[->]>>>+<[->-<<+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.---------------.+.+++.-------.[-]>]>[-<<++>+<[-<<+<[>-<->]>[->>>-<[-]<]>]<<+<[>->>>-<<<]>[->]>>>+<[->-<<+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.------------------.+++++++++.----------.[-]>]>[-<+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.+++++.------------.---.+++++++++++++.[-]>]]]]]]]]",
    runs: [
      { i: "+", o: "INC" },
      { i: "-", o: "DEC" },
      { i: "\n", o: "OTHER" },
    ],
  },
  {
    label: "範囲外エラーが発生しなければOK",
    code: "[-<+>]",
    runs: [{ o: "" }],
  },
  {
    label: "インクリメント",
    code: ">>>>>>>>++++++++++<<<<<<<<,----------[-------------------------------------->[-<++++++++++>]<[->+<],----------]>+[->>>>>>[>>>>>]+[>>+<[>-]>[-<++++++++++>>]<<->+<[>-<<[-<<<<<]>>]>[-<++++++++++>>>>+>>>]<<<][<<<<<]<]>>>>>>[>>>>>]>[<+>>>>>>]<<<<<[>>>++++++++++++++++++++++++++++++++++++++++++++++++++++++++++<<<[->>>-<<<]>>>.<<<++++++++++++++++++++++++++++++++++++++++++++++++++++++++++>>>[-<<<->>>]<<<<-<<<<]",
    runs: [
      { i: "9\n", o: "10" },
      { i: "65534\n", o: "65535", cellType: "uint16" },
      { i: "65534\n", o: "255", cellType: "uint8" }, // wrap-around (8bit)
      { i: "65535\n", o: "0", cellType: "uint16" }, // wrap-around (16bit)
    ],
  },
  {
    label: "文字コード",
    code: ">>>>>>>>++++++++++<<<<<<<<+[>,----------<[-]>[++++++++++>>>>>>[>>>>>]>[<+>>>>>>]<<<<<[[-]<-<<<<]<[<<<<<]>>>>>>++++++++++<<<<<<<[->>>>>>[>>>>>]+[>>+<[>-]>[-<++++++++++>>]<<->+<[>-<<[-<<<<<]>>]>[-<++++++++++>>>>+>>>]<<<][<<<<<]<]>>>>>>[>>>>>]>[<+>>>>>>]<<<<<[>>>++++++++++++++++++++++++++++++++++++++++++++++++++++++++++<<<[->>>-<<<]>>>.<<<++++++++++++++++++++++++++++++++++++++++++++++++++++++++++>>>[-<<<->>>]<<<<-<<<<]<[<<<<<]<<++++++++++.>]<]",
    runs: [
      { i: "A0\n", o: "65\n48\n" },
      { i: "あ\n", o: `${0xe3}\n${0x81}\n${0x82}\n` },
      { i: "あ\n", o: "12354\n", cellType: "uint16", encoding: Utf16Codec },
      { i: "あ\n", o: "12354\n", cellType: "uint16", encoding: Utf16Codec },
      {
        i: "🌕\n",
        o: "55356\n57109\n",
        cellType: "uint16",
        encoding: Utf16Codec,
      },
    ],
  },
  {
    label: "wrap-around",
    code: "----------------------------------------------------------------------------------------------------------------------------------.",
    runs: [{ o: "~" }],
  },
  {
    label: "最適化されたループのwrap-around",
    code: "+++++ +++++ +++++ [- > +++++ +++++ +++++ ++ <] + > [-<+>] < [+++++ +++++  +++++ +++++  +++++ +++++ +++ .[-]]",
    runs: [{ o: "" }, { o: "!", cellType: "uint16" }],
  },
];

describe.each(testCases)("実行できる ($label)", (tc) => {
  const res = parse(tc.code);
  if (res.t === "error") {
    expect.fail(res.msg);
  }
  const commands = optimize(res.commands);

  test.each(tc.runs)("#%# 出力が正しい", async (run) => {
    const output = await new Promise<string>((resolve, reject) => {
      let buf = "";
      const handler = (ev: RunnerEvent) => {
        if (ev.t === "output") {
          buf += ev.output;
        } else if (ev.t === "finish") {
          resolve(buf);
        } else if (ev.t === "error") {
          reject(ev.kind);
        }
      };
      new Runner().run(commands, run.i ?? "", handler, {
        cellType: run.cellType ?? "uint8",
        arrayLength: 30000,
        encoding: run.encoding ?? Utf8Codec,
        disableWrapAround: false,
      });
    });
    expect(output).toBe(run.o);
  });

  test.each(tc.runs)("#%# インタラクティブ入力", async (run) => {
    const input = run.i ?? "";
    if (input === "") {
      return;
    }
    const output = await new Promise<string>((resolve, reject) => {
      const ibuf = [...input];
      let obuf = "";

      const runner = new Runner();
      const handler = (ev: RunnerEvent) => {
        if (ev.t === "input") {
          const c = ibuf.shift();
          if (c === undefined) {
            reject("eof");
            return;
          }
          runner.input(c);
        } else if (ev.t === "output") {
          obuf += ev.output;
        } else if (ev.t === "finish") {
          resolve(obuf);
        } else if (ev.t === "error") {
          reject(ev.kind);
        }
      };
      runner.run(commands, "", handler, {
        cellType: run.cellType ?? "uint8",
        arrayLength: 30000,
        encoding: run.encoding ?? Utf8Codec,
        disableWrapAround: false,
      });
    });
    expect(output).toBe(run.o);
  });
});

describe("ポインタ範囲外エラーが発生する", () => {
  test.each(["<", "+[>+]", "+[-<+>]", ">>>>>"])("%s", async (code) => {
    const res = parse(code);
    if (res.t === "error") {
      expect.fail(res.msg);
    }
    const commands = optimize(res.commands);

    const promise = new Promise<void>((resolve, reject) => {
      const handler = (ev: RunnerEvent) => {
        if (ev.t === "error" && ev.kind === "pointer") {
          resolve();
        } else {
          reject();
        }
      };
      new Runner().run(commands, "", handler, {
        cellType: "uint8",
        arrayLength: 5,
        encoding: Utf8Codec,
        disableWrapAround: false,
      });
    });

    await expect(promise).resolves.toBeUndefined();
  });
});

describe("Wrap-around禁止", () => {
  test.each(["-", "+[+]", "+++++ +++++ +++++ + [-> +++++ +++++ +++++ + <]"])(
    "%s",
    async (code) => {
      const res = parse(code);
      if (res.t === "error") {
        expect.fail(res.msg);
      }
      const promise = new Promise<void>((resolve, reject) => {
        const handler = (ev: RunnerEvent) => {
          if (ev.t === "error" && ev.kind === "overflow") {
            resolve();
          } else {
            reject();
          }
        };
        new Runner().run(res.commands, "", handler, {
          cellType: "uint8",
          arrayLength: 30000,
          encoding: Utf8Codec,
          disableWrapAround: true,
        });
      });
      await expect(promise).resolves.toBeUndefined();
    },
  );
});
