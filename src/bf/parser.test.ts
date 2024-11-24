import { expect, test } from "vitest";
import { parse } from "./parser";

test("読める", () => {
  const res = parse("+++ +-+>>>*><>.,[+[-]]");
  if (res.t === "error") {
    expect.fail();
  } else {
    expect(res.commands).toEqual([
      { t: "add", n: 4 },
      { t: "shift", n: 4 },
      { t: "output" },
      { t: "input" },
      {
        t: "loop",
        commands: [
          { t: "add", n: 1 },
          { t: "loop", commands: [{ t: "add", n: -1 }] },
        ],
      },
    ]);
  }
});

test("'[' が多すぎるときにエラーが出る", () => {
  const code = `aaa
bbb
c[[]`;
  const res = parse(code);
  if (res.t === "succeed") {
    expect.fail();
  } else {
    expect(res.line).toBe(3);
    expect(res.col).toBe(2);
    expect(res.msg).toContain("[");
  }
});

test("']' が多すぎるときにエラーが出る", () => {
  const res = parse("[]]");
  if (res.t === "succeed") {
    expect.fail();
  } else {
    expect(res.line).toBe(1);
    expect(res.col).toBe(3);
    expect(res.msg).toContain("]");
  }
});
