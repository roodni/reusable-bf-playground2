import hello2 from "../assets/examples/hello2.bfml?raw";
import counter from "../assets/examples/lib/counter.bfml?raw";
import fixedint from "../assets/examples/lib/fixedint.bfml?raw";
import future from "../assets/examples/lib/future.bfml?raw";
import std from "../assets/examples/lib/std.bfml?raw";
import queens from "../assets/examples/queens.bfml?raw";

export type FileSettings = {
  name: string;
  code: string;
};

export const fileSettingsList: FileSettings[] = [
  {
    name: "sandbox.bfml",
    code: `open import "std.bfml"
let rec f () = f ();;
let main = [
  *gen_puts "HELLO\\n"
  
]`,
  },
  {
    name: "hello2.bfml",
    code: hello2,
  },
  {
    name: "std.bfml",
    code: std,
  },
  {
    name: "counter.bfml",
    code: counter,
  },
  {
    name: "fixedint.bfml",
    code: fixedint,
  },
  {
    name: "future.bfml",
    code: future,
  },
  {
    name: "queens",
    code: queens,
  },
  {
    name: "fatal",
    code: `let rec f () = 0 + f ();;
let main = [
  ;f ()
]`,
  },
];
