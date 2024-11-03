// import { createSignal } from 'solid-js';
import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-ocaml";
import { Component, onMount } from "solid-js";
import "./App.css";
import code from "./assets/hello2.bfml?raw";

const Textarea: Component = () => {
  return (
    <textarea
      rows={7}
      style={{
        width: "100%",
        resize: "vertical",
        display: "block",
      }}
    />
  );
};

export default function App() {
  const headerHeight = "3rem";
  const leftFooterHeight = "3rem";

  onMount(() => {
    ace.edit("editor", {
      mode: "ace/mode/ocaml",
      fontSize: 16,
      value: code,
    });
  });

  return (
    <div
      style={{
        display: "flex",
        "flex-wrap": "wrap",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          width: "100%",
          height: headerHeight,
          // 'background-color': 'burlywood'
        }}
        class="valign-center"
      >
        <div style={{ "font-size": "1.5rem" }} class="right-box">
          Reusable-bf Playground
        </div>
      </div>

      {/* 左 */}
      <div
        style={{
          width: "50%",
          height: `calc(100svh - ${headerHeight})`,
          // 'background-color': 'olive',
          padding: "4px",
        }}
      >
        <div
          style={{
            height: `calc(100% - ${leftFooterHeight})`,
          }}
        >
          <div id="editor" />
        </div>
        <div
          style={{
            height: leftFooterHeight,
            "justify-content": "right",
          }}
          class="valign-center"
        >
          <select class="input">
            <option>sandbox.bfml</option>
            <option>examples/hello.bfml</option>
            <option>std.bfml</option>
          </select>
          <button class="input">Compile</button>
        </div>
      </div>

      {/* 右 */}
      <div
        style={{
          width: "50%",
          height: `calc(100svh - ${headerHeight})`,
          // 'background-color': 'peachpuff',
          "overflow-y": "scroll",
        }}
      >
        <div class="right-box">これがAce Editorの力だ</div>
        <div class="right-box">
          brainf**k:
          <Textarea />
        </div>
        <div class="right-box">
          Input:
          <Textarea />
          <button class="input">Run</button>
          <button class="input" disabled>
            Stop
          </button>
        </div>
        <div class="right-box">
          Output:
          <Textarea />
        </div>
      </div>
    </div>
  );
}
