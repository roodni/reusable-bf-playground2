import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-ocaml";
import { createSignal, Match, onMount, Show, Switch } from "solid-js";
import { CodeArea, CodeDisplayArea } from "./Components";
import CompileWorker from "./assets/playground.bc.js?worker";
import { fileSettingsList } from "./fileSettings";

type CompilingState =
  | { t: "ready" }
  | { t: "compiling"; worker: Worker }
  | { t: "succeed" }
  | { t: "failed" }
  | { t: "terminated" }
  | { t: "fatal" };

export default function App() {
  const headerHeight = "3rem";
  const leftFooterHeight = "3rem";

  const [stderr, setStderr] = createSignal("");

  // let bfmlEditor: ace.Ace.Editor;
  let bfArea: HTMLTextAreaElement;

  onMount(() => {
    ace.edit("editor", {
      mode: "ace/mode/ocaml",
      fontSize: 16,
      value: fileSettingsList[0].code,
    });
  });

  const [compilingState, setCompilingState] = createSignal<CompilingState>({
    t: "ready",
  });

  const compileHandler = () => {
    if (compilingState().t === "compiling") {
      return;
    }
    const worker = new CompileWorker();
    setCompilingState({ t: "compiling", worker });
    worker.addEventListener("message", (res) => {
      worker.terminate();
      console.log(res.data);
      setStderr(res.data.err);
      bfArea.value = res.data.out;
      setCompilingState({ t: res.data.success ? "succeed" : "failed" });
    });
    worker.addEventListener("error", (e) => {
      worker.terminate();
      console.error(e);
      setCompilingState({ t: "fatal" });
    });
    worker.postMessage({
      files: fileSettingsList.map((f) => ({
        name: f.name,
        content: f.code,
      })),
      entrypoint: "hello2.bfml",
      optimize: 3,
      showLayout: false,
      maxLength: 1000000,
    });
    bfArea.value = "";
    setStderr("");
  };

  const stopCompileHandler = () => {
    const state = compilingState();
    if (state.t !== "compiling") {
      return;
    }
    state.worker.terminate();
    setCompilingState({ t: "terminated" });
  };

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
          <button
            class="input"
            onClick={compileHandler}
            disabled={compilingState().t === "compiling"}
          >
            Compile
          </button>
          <button
            class="input"
            onClick={stopCompileHandler}
            disabled={compilingState().t !== "compiling"}
          >
            Stop
          </button>
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
        <div class="right-box">
          <Switch>
            <Match when={compilingState().t === "ready"}>Ready</Match>
            <Match when={compilingState().t === "compiling"}>
              Compiling ...
            </Match>
            <Match when={compilingState().t === "succeed"}>Compiled</Match>
            <Match when={compilingState().t === "failed"}>
              Failed to compile
            </Match>
            <Match when={compilingState().t === "terminated"}>
              Compilation aborted
            </Match>
            <Match when={compilingState().t === "fatal"}>Fatal error</Match>
          </Switch>
        </div>
        <Show when={stderr() !== ""}>
          <div class="right-box">
            Stderr output:
            <CodeDisplayArea code={stderr()} />
          </div>
        </Show>
        <div class="right-box">
          brainf**k:
          <CodeArea ref={bfArea} />
        </div>
        <div class="right-box">
          Input:
          <CodeArea />
          <button class="input">Run</button>
          <button class="input" disabled>
            Stop
          </button>
        </div>
        <div class="right-box">
          Output:
          <CodeArea />
        </div>
      </div>
    </div>
  );
}
