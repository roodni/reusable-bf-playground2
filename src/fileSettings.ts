import hello2 from "./assets/examples/hello2.bfml?raw";
import std from "./assets/examples/std.bfml?raw";

type FileSettings = {
  name: string;
  code: string;
};

export const fileSettingsList: FileSettings[] = [
  {
    name: "std.bfml",
    code: std,
  },
  {
    name: "hello2.bfml",
    code: hello2,
  },
];
