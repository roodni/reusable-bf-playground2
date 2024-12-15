import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-fsharp";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { CodeArea, CodeAreaRef, CodeDisplayArea } from "./Components";
import CompileWorker from "./assets/playground.bc.js?worker";
import * as BfParser from "./bf/parser";
import * as BfRunner from "./bf/runner";
import { FileSettings, fileSettingsList } from "./fileSettings";

// Ace Editorの設定をここに書く
const aceEditorOptions: Partial<ace.Ace.EditorOptions> = {
  fontSize: 14,
  showPrintMargin: false,
};
function configureAceSession(session: ace.Ace.EditSession) {
  session.setMode("ace/mode/fsharp");
  session.setTabSize(2);
  session.setUseSoftTabs(true);
}

function narrowType<T, U extends T>(o: T, f: (o: T) => o is U): U | false {
  return f(o) ? o : false;
}

export default function App() {
  const ctrlEnter = "Ctrl + Enter";

  type EditingFile = {
    session: ace.Ace.EditSession | undefined;
    settings: FileSettings;
  };
  const editingFiles = new Map<string, EditingFile>(
    fileSettingsList.map((settings) => [
      settings.name,
      {
        session: undefined,
        settings,
      },
    ]),
  );

  let bfmlEditorElement!: HTMLDivElement;
  const [bfmlEditor, setBfmlEditor] = createSignal<ace.Ace.Editor | undefined>(
    undefined,
  );
  onMount(() => {
    const editor = ace.edit(bfmlEditorElement, aceEditorOptions);
    setBfmlEditor(editor);
  });

  const handleBeforeUnload = (event: Event) => {
    // ファイルが編集されていたら遷移時に確認する
    const changed = editingFiles
      .values()
      .toArray()
      .some((f) => f.session && f.session.getValue() !== f.settings.code);
    if (changed) {
      event.preventDefault();
    }
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  onCleanup(() => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
  });

  // ファイル選択に関すること
  const [selectingFileName, setSelectingFileName] = createSignal(
    (fileSettingsList.find((s) => s.selected) ?? fileSettingsList[0]).name,
  );

  let fileSelect!: HTMLSelectElement;
  createEffect(() => {
    fileSelect.value = selectingFileName();
  });
  const handleFileChange = () => {
    setSelectingFileName(fileSelect.value);
  };

  // ファイル選択に変更があったら、エディタの内容を切り替える
  createEffect(() => {
    const name = selectingFileName();
    const editingFile = editingFiles.get(name);
    const editor = bfmlEditor();
    if (!editingFile || !editor) {
      return;
    }
    if (!editingFile.session) {
      editingFile.session = ace.createEditSession(
        editingFile.settings.code,
        editor.session.getMode(), // 第二引数は本当は省略できそう
      );
      configureAceSession(editingFile.session);
    }
    editor.setSession(editingFile.session);
  });

  // コンパイルに関すること
  const [stderr, setStderr] = createSignal("");

  let bfAreaRef!: CodeAreaRef;
  const [bfCode, _setBfCode] = createSignal("");
  const bfCodeSize = createMemo(() => {
    const code = bfCode();
    let cnt = 0;
    const commands = "+-.,<>[]";
    for (const c of code) {
      if (commands.includes(c)) {
        cnt++;
      }
    }
    return cnt;
  });

  type CompilingState =
    | { t: "ready" }
    | { t: "compiling"; cleanup: () => void }
    | { t: "succeed" }
    | { t: "failed" }
    | { t: "aborted" }
    | { t: "fatal"; message: string };
  const [compilingState, _setCompilingState] = createSignal<CompilingState>({
    t: "ready",
  });
  const updateCompilingState = (next: CompilingState) => {
    const prev = compilingState();
    if (prev.t === "compiling") {
      prev.cleanup();
    }
    _setCompilingState(next);
  };

  const [compilingTime, setCompilingTime] = createSignal(0);
  const compilingSec = () => compilingTime() / 1000;
  const [compiledFileName, setCompiledFileName] = createSignal("");

  const compile = () => {
    if (compilingState().t === "compiling") {
      return;
    }
    const worker = new CompileWorker();

    setCompilingTime(0);
    const startTime = Date.now();
    const updateTime = () => {
      setCompilingTime(Date.now() - startTime);
    };
    const elapsedTimeTimer = setInterval(updateTime, 1000);
    const timeoutTimer = setTimeout(() => {
      updateCompilingState({ t: "aborted" });
    }, 30000);

    const cleanup = () => {
      worker.terminate();
      clearInterval(elapsedTimeTimer);
      updateTime();
      clearTimeout(timeoutTimer);
    };
    updateCompilingState({ t: "compiling", cleanup });

    worker.addEventListener("message", (res) => {
      setStderr(res.data.err);
      bfAreaRef.update(res.data.out);
      updateCompilingState({ t: res.data.success ? "succeed" : "failed" });
    });
    worker.addEventListener("error", (e) => {
      console.error(e);
      updateCompilingState({ t: "fatal", message: e.message });
    });

    const filename = selectingFileName();
    setCompiledFileName(filename);
    const files = editingFiles
      .values()
      .map((f) => ({
        name: f.settings.name,
        content: f.session?.getValue() ?? f.settings.code,
      }))
      .toArray();
    worker.postMessage({
      files,
      entrypoint: filename,
      optimize: 3,
      showLayout: false,
      maxLength: 1000000,
    });

    bfAreaRef.update("");
    setStderr("");
  };

  const handleStopCompileClick = () => {
    if (compilingState().t === "compiling") {
      updateCompilingState({ t: "aborted" });
    }
  };

  const handleBfAreaInput = () => {
    switch (compilingState().t) {
      case "succeed":
      case "failed":
      case "aborted":
      case "fatal":
        setStderr("");
        updateCompilingState({ t: "ready" });
        break;
    }
  };

  // インタプリタに関すること
  let bfInputAreaRef!: CodeAreaRef;
  const [bfInput, _setBfInput] = createSignal("");
  const bfInputLines = createMemo(() => {
    const text = bfInput();
    if (text.length === 0) {
      return 0;
    }
    let cnt = 1;
    for (const c of text) {
      if (c === "\n") {
        cnt++;
      }
    }
    return cnt;
  });

  const [bfRunner, setBfRunner] = createSignal<BfRunner.Runner | undefined>(
    undefined,
  );
  const [bfError, setBfError] = createSignal("");
  const [bfOutput, setBfOutput] = createSignal("");

  const handleBfRunnerEvent = (ev: BfRunner.RunnerEvent) => {
    const runner = bfRunner();
    if (!runner) {
      return;
    }
    switch (ev.t) {
      case "input":
        // TODO: 追加入力を受け付ける
        break;
      case "output": {
        // メモリ食いつぶし防止のため、出力文字数には制限を設ける
        const output = (bfOutput() + ev.output).slice(-10000);
        setBfOutput(output);
        break;
      }
      case "finish":
        setBfRunner(undefined);
        break;
      case "error":
        if (ev.kind === "pointer") {
          setBfError("Error: Pointer out of range");
        }
        setBfRunner(undefined);
        break;
    }
  };

  const runBf = () => {
    setBfError("");
    setBfOutput("");
    const code = bfCode();
    const parseResult = BfParser.parse(code);
    if (parseResult.t === "error") {
      const msg = `Syntax Error: ${parseResult.msg} (line ${parseResult.line}, col ${parseResult.col})`;
      setBfError(msg);
      return;
    }

    const runner = new BfRunner.Runner(
      parseResult.commands,
      bfInput(),
      handleBfRunnerEvent,
      {
        mode: "utf8",
      },
    );
    setBfRunner(runner);
  };
  const stopBf = () => {
    const runner = bfRunner();
    if (runner) {
      runner.terminate();
      setBfRunner(undefined);
    }
  };

  // キーボードショートカット
  const [bfmlOrBf, setBfmlOrBf] = createSignal<"bfml" | "bf">("bfml");
  const handleAppKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.repeat
    ) {
      if (bfmlOrBf() === "bfml") {
        compile();
      } else {
        runBf();
      }
    }
  };

  return (
    <div class="app" onKeyDown={handleAppKeyDown}>
      {/* ヘッダー */}
      <div class="header pad-box">
        <div class="t">Reusable-bf Playground</div>
      </div>

      {/* 左 */}
      <div
        class="l pad-box"
        onMouseDown={
          // 配列で指定すると型検査が効かない気がする
          () => setBfmlOrBf("bfml")
        }
      >
        <div class="editor-container">
          <div ref={bfmlEditorElement} class="editor" />
        </div>
        <div class="editor-button-container">
          <select ref={fileSelect} class="input" onChange={handleFileChange}>
            <For each={fileSettingsList}>
              {(setting) => (
                <option value={setting.name}>{setting.name}</option>
              )}
            </For>
          </select>
          <button
            class="input"
            onClick={compile}
            disabled={compilingState().t === "compiling"}
          >
            {"Compile "}
            <span
              classList={{
                shortcut: true,
                "shortcut-disabled": bfmlOrBf() !== "bfml",
              }}
            >
              ({ctrlEnter})
            </span>
          </button>
          <button
            class="input"
            onClick={handleStopCompileClick}
            disabled={compilingState().t !== "compiling"}
          >
            Stop
          </button>
        </div>
      </div>

      {/* 右 */}
      <div class="r" onMouseDown={() => setBfmlOrBf("bf")}>
        <div class="pad-box">
          <Switch>
            <Match when={compilingState().t === "ready"}>Ready</Match>
            <Match when={compilingState().t === "compiling"}>
              Compiling ... ({compiledFileName()}, {compilingSec().toFixed(0)}s)
            </Match>
            <Match when={compilingState().t === "succeed"}>
              Compiled ({compiledFileName()}, {compilingSec().toFixed(1)}s)
            </Match>
            <Match when={compilingState().t === "failed"}>
              Compilation failed ({compiledFileName()},{" "}
              {compilingSec().toFixed(1)}s)
            </Match>
            <Match when={compilingState().t === "aborted"}>
              Compilation aborted ({compiledFileName()},{" "}
              {compilingSec().toFixed(1)}s)
            </Match>
            <Match when={narrowType(compilingState(), (s) => s.t === "fatal")}>
              {(s) => <>Fatal error: {s().message}</>}
            </Match>
          </Switch>
          <div style={{ display: stderr() === "" ? "none" : "block" }}>
            <CodeDisplayArea
              code={stderr()}
              variant={compilingState().t === "succeed" ? "normal" : "error"}
            />
          </div>
        </div>
        <div class="pad-box">
          brainf**k
          <Show when={bfCodeSize() >= 1}> ({bfCodeSize()} commands)</Show>
          <CodeArea
            ref={bfAreaRef}
            onUpdate={_setBfCode}
            onInput={handleBfAreaInput}
            defaultValue={bfCode()}
            disabled={compilingState().t === "compiling"}
          />
        </div>
        <div class="pad-box">
          Input ({bfInputLines()} lines)
          <CodeArea
            ref={bfInputAreaRef}
            onUpdate={_setBfInput}
            defaultValue={bfInput()}
          />
          <div class="input-button-container">
            <button class="input" onClick={runBf} disabled={!!bfRunner()}>
              {"Run "}
              <span
                classList={{
                  shortcut: true,
                  "shortcut-disabled": bfmlOrBf() !== "bf",
                }}
              >
                ({ctrlEnter})
              </span>
            </button>
            <button class="input" onClick={stopBf} disabled={!bfRunner()}>
              Stop
            </button>
          </div>
        </div>
        <Show when={bfError() !== ""}>
          <div class="pad-box">
            <CodeDisplayArea code={bfError()} variant={"error"} />
          </div>
        </Show>
        <div class="pad-box">
          Output
          <CodeDisplayArea code={bfOutput()} />
        </div>
      </div>
    </div>
  );
}
