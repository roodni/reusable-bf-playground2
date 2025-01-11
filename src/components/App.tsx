import ace from "ace-builds";
import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { createStore } from "solid-js/store";
import CompileWorker from "../assets/playground.bc.js?worker";
import * as BfOptimizer from "../bf/optimizer";
import * as BfParser from "../bf/parser";
import * as BfRunner from "../bf/runner";
import { CodeArea, CodeAreaRef, CodeDisplayArea } from "./CodeArea";
import { FileSettings, fileSettingsList } from "./fileSettings";
import "./highlighter.js";

// Ace Editorの設定をここに書く
const aceEditorOptions: Partial<ace.Ace.EditorOptions> = {
  fontSize: 16,
  showPrintMargin: false,
};
function configureAceSession(session: ace.Ace.EditSession) {
  session.setTabSize(2);
  session.setUseSoftTabs(true);
}

const CtrlEnterText: Component<{ disabled: boolean }> = (props) => (
  <span
    classList={{
      shortcut: true,
      "shortcut-disabled": props.disabled,
    }}
  >
    (Ctrl + Enter)
  </span>
);

export function App() {
  type BfmlFile = {
    settings: FileSettings;
    isChanged: boolean;
  };
  const [bfmlFiles, setBfmlFiles] = createStore<BfmlFile[]>(
    fileSettingsList.map((s) => ({
      settings: s,
      session: undefined,
      isChanged: false,
    })),
  );
  const sessions = new Map<string, ace.Ace.EditSession>();

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
    const changed = bfmlFiles.some((f) => f.isChanged);
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
    fileSettingsList[0].name,
  );

  let fileSelect!: HTMLSelectElement;
  createEffect(() => {
    fileSelect.value = selectingFileName();
  });
  const handleFileChange = () => {
    setSelectingFileName(fileSelect.value);
  };

  const selectingFile = () => {
    const name = selectingFileName();
    const file = bfmlFiles.find((f) => f.settings.name === name);
    if (!file) {
      throw new Error(`File not found: ${name}`);
    }
    return file;
  };

  // ファイル選択に変更があったら、エディタの内容を切り替える
  const BfmlMode = ace.require("ace/mode/bfml").Mode;
  createEffect(() => {
    const editor = bfmlEditor();
    if (!editor) {
      return;
    }
    const file = selectingFile();

    const name = file.settings.name;
    let session = sessions.get(name);
    if (!session) {
      const s = ace.createEditSession(file.settings.code, new BfmlMode()); // 第二引数は文字列でも渡せそうなんだが型が合わない
      configureAceSession(s);
      s.on("change", () => {
        const isChanged = s.getValue() !== file.settings.code;
        setBfmlFiles((f) => f.settings.name === name, { isChanged });
      });
      sessions.set(name, s);
      session = s;
    }
    editor.setSession(session);
  });

  const handleResetClick = () => {
    const file = selectingFile();
    const name = file.settings.name;
    const session = sessions.get(name);
    if (!session) {
      return;
    }
    session.doc.setValue(file.settings.code);
  };

  // コンパイルに関すること
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

  type CompilationStatus =
    | "ready"
    | "compiling"
    | "succeed"
    | "failed"
    | "aborted"
    | "fatal";
  const [compilation, setCompilation] = createStore({
    status: "ready" satisfies CompilationStatus as CompilationStatus,

    // ダミーの値を与えるのは不本意だが、discriminated unionにしたところで楽にはならなそう
    err: "", // エラーメッセージやレイアウト表示に使う
    elapsedTime: 0,
    filename: "",
  });
  const compilingSec = () => compilation.elapsedTime / 1000;

  let stopCompile = () => {};
  const handleStopCompileButtonClick = () => {
    stopCompile();
  };

  let showLayoutCheckbox!: HTMLInputElement;
  let optimizationLevelSelect!: HTMLSelectElement;
  let timeoutSelect!: HTMLSelectElement;

  const canCompile = () => compilation.status !== "compiling";
  const compile = async () => {
    if (!canCompile()) {
      return;
    }

    const filename = selectingFileName();
    setCompilation({
      status: "compiling",
      err: "",
      elapsedTime: 0,
      filename,
    });
    bfAreaRef.update("");

    const startTime = Date.now();
    const updateTime = () => {
      setCompilation("elapsedTime", Date.now() - startTime);
    };
    const elapsedTimeTimer = setInterval(updateTime, 1000);

    const worker = new CompileWorker();

    const files = bfmlFiles.map((f) => ({
      name: f.settings.name,
      content: sessions.get(f.settings.name)?.getValue() ?? f.settings.code,
    }));

    let timeoutTimer: number | undefined;
    const callback = await new Promise<() => void>((resolve) => {
      worker.addEventListener("message", (res) => {
        resolve(() => {
          bfAreaRef.update(res.data.out);
          setCompilation({
            status: res.data.success ? "succeed" : "failed",
            err: res.data.err,
          });
        });
      });
      worker.addEventListener("error", (e) => {
        resolve(() => {
          console.error(e);
          const err = e.message ?? ""; // 通信エラーのとき ErrorEvent ではなく Event になって message が存在しない
          setCompilation({ status: "fatal", err });
        });
      });

      const abort = () => resolve(() => setCompilation({ status: "aborted" }));
      stopCompile = abort;
      const timeout = parseInt(timeoutSelect.value);
      if (timeout > 0) {
        timeoutTimer = window.setTimeout(abort, timeout * 1000);
      }

      worker.postMessage({
        files,
        entrypoint: filename,
        showLayout: showLayoutCheckbox.checked,
        optimize: parseInt(optimizationLevelSelect.value),
        maxLength: 1000000,
      });
    });

    worker.terminate();
    updateTime();
    window.clearInterval(elapsedTimeTimer);
    window.clearTimeout(timeoutTimer);

    callback();
  };

  const handleBfAreaInput = () => {
    switch (compilation.status) {
      case "succeed":
      case "failed":
      case "aborted":
      case "fatal":
        setCompilation({ status: "ready", err: "" });
        break;
    }
  };

  // フォーカスの状態を追う
  // 主にショートカットキーで使う
  const [focuses, setFocuses] = createStore({
    bfml: false,
    bfmlSettings: false,
    run: false,
  });
  const ctrlEnterAction = () => {
    if (focuses.bfml || focuses.bfmlSettings) {
      return "compile";
    } else if (focuses.run) {
      return "run";
    } else {
      return undefined;
    }
  };

  // インタプリタに関すること
  let bfRunButton!: HTMLButtonElement;
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

  const bfInputFromFileName = new Map<string, string>();
  createEffect(() => {
    // ファイルに応じて入力を変える
    const file = selectingFile();
    const input =
      bfInputFromFileName.get(file.settings.name) ?? file.settings.input ?? "";
    bfInputAreaRef.update(input);
  });
  createEffect(
    on(bfInput, (input) => {
      // 入力をファイルごとに保存しておく
      bfInputFromFileName.set(selectingFileName(), input);
    }),
  );

  let bfInteractiveInputRef!: HTMLInputElement;

  // この辺煩雑なのでどうにかしたい
  const [bfRunner, _setBfRunner] = createSignal<BfRunner.Runner | undefined>(
    undefined,
  );
  const isBfRunning = () => bfRunner() !== undefined;
  const [isBfInputRequired, setIsBfInputRequired] = createSignal(false);
  const [bfError, setBfError] = createSignal("");
  const [bfOutput, setBfOutput] = createSignal("");
  // let bfStartTime = 0;

  const afterBfTerminated = () => {
    // console.log("%f seconds", (Date.now() - bfStartTime) / 1000);
    setIsBfInputRequired(false);
    _setBfRunner(undefined);
    if (!focuses.run) {
      // フォーカスがない場合、実行ボタンにフォーカスする
      // Ctrl + Enterで実行する場合はフォーカスが残るので、例えばInputを編集しながら連続で実行することができる
      bfRunButton.focus();
    }
  };

  const handleBfRunnerEvent = (ev: BfRunner.RunnerEvent) => {
    switch (ev.t) {
      case "input":
        setIsBfInputRequired(true);
        bfInteractiveInputRef.focus();
        break;
      case "output": {
        // メモリ食いつぶし防止のため、出力文字数には制限を設ける
        const output = (bfOutput() + ev.output).slice(-10000);
        setBfOutput(output);
        break;
      }
      case "finish":
        afterBfTerminated();
        break;
      case "error":
        switch (ev.kind) {
          case "pointer":
            setBfError("Error: Pointer out of range");
            break;
          case "fatal":
            setBfError("Fatal error");
            break;
        }
        afterBfTerminated();
        break;
    }
  };

  const canRunBf = () => !isBfRunning() && bfCodeSize() > 0;
  const runBf = () => {
    if (!canRunBf()) {
      return;
    }
    setBfError("");
    setBfOutput("");
    const code = bfCode();
    const parseResult = BfParser.parse(code);
    if (parseResult.t === "error") {
      const msg = `Syntax Error: ${parseResult.msg} (line ${parseResult.line}, col ${parseResult.col})`;
      setBfError(msg);
      return;
    }

    const optimized = BfOptimizer.optimize(parseResult.commands);
    // const optimized = parseResult.commands;
    const input = bfInput();
    const runner = new BfRunner.Runner();
    runner.run(optimized, input, handleBfRunnerEvent, {
      mode: "utf8",
    });
    _setBfRunner(runner);
    setIsBfInputRequired(false);
    // bfStartTime = Date.now();
  };
  const stopBf = () => {
    const runner = bfRunner();
    if (runner) {
      runner.abort();
      afterBfTerminated();
    }
  };
  const submitBfInteractiveInput = () => {
    const runner = bfRunner();
    if (!runner || !isBfInputRequired()) {
      return;
    }
    const i = bfInteractiveInputRef.value + "\n";
    bfInteractiveInputRef.value = "";
    runner.input(i);
    setIsBfInputRequired(false);
  };
  const handleSubmitBfInteractiveInput = (ev: SubmitEvent) => {
    submitBfInteractiveInput();
    ev.preventDefault();
  };

  // キーボードショートカット
  const handleCtrlEnter = (event: KeyboardEvent) => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.repeat
    ) {
      const action = ctrlEnterAction();
      if (action === "compile") {
        compile();
      } else if (action === "run") {
        runBf();
      }
    }
  };

  return (
    <div class="app" onKeyDown={handleCtrlEnter}>
      {/* ヘッダー */}
      <div class="header pad">
        <h1 class="heading1">Reusable-bf Playground</h1>
      </div>

      {/* 左 */}
      <div
        class="left pad"
        onFocusIn={() => setFocuses("bfml", true)}
        onFocusOut={() => setFocuses("bfml", false)}
      >
        <div class="inputs-container">
          <select
            ref={fileSelect}
            class="input expand"
            onChange={handleFileChange}
          >
            <For each={bfmlFiles}>
              {(f) => (
                <option value={f.settings.name}>
                  {f.settings.name}
                  <Show when={f.isChanged}>*</Show>
                </option>
              )}
            </For>
          </select>
          <button
            class="input"
            disabled={!selectingFile().isChanged}
            onClick={handleResetClick}
          >
            Reset
          </button>
        </div>
        <div ref={bfmlEditorElement} class="editor" />
        <div class="inputs-container">
          <button
            class="input expand"
            onClick={compile}
            disabled={!canCompile()}
          >
            {"Compile "}
            <CtrlEnterText
              disabled={ctrlEnterAction() !== "compile" || !canCompile()}
            />
          </button>
          <button
            class="input expand"
            onClick={handleStopCompileButtonClick}
            disabled={compilation.status !== "compiling"}
          >
            Stop
          </button>
        </div>
      </div>

      {/* 右 */}
      <div class="right pad sections-column">
        <div
          class="paragraphs-column"
          onFocusIn={() => setFocuses("bfmlSettings", true)}
          onFocusOut={() => setFocuses("bfmlSettings", false)}
        >
          <details>
            <summary class="settings-summary">Compilation Settings</summary>
            <table class="settings-table">
              <tbody>
                <tr>
                  <td>
                    <label for="settings-show-layout">Show layouts</label>
                  </td>
                  <td>
                    <input
                      ref={showLayoutCheckbox}
                      id="settings-show-layout"
                      type="checkbox"
                      class="settings-checkbox"
                    />
                  </td>
                </tr>
                <tr>
                  <td>
                    <label for="settings-optimize">Optimization level</label>
                  </td>
                  <td>
                    <select
                      ref={optimizationLevelSelect}
                      id="settings-optimize"
                    >
                      <option value="0">0 (No optimization)</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3" selected>
                        3 (Max)
                      </option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td>
                    <label for="settings-timeout">Timeout</label>
                  </td>
                  <td>
                    <select ref={timeoutSelect} id="settings-timeout">
                      <option value="5">5 s</option>
                      <option value="0">Never</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>

        <div
          class="paragraphs-column"
          onFocusIn={() => setFocuses("run", true)}
          onFocusOut={() => setFocuses("run", false)}
        >
          <div class="forms-column">
            <div>
              <Switch>
                <Match when={compilation.status === "ready"}>
                  🟦 Ready to compile
                </Match>
                <Match when={compilation.status === "compiling"}>
                  ⌛ Compiling ... ({compilation.filename},{" "}
                  {compilingSec().toFixed(0)}
                  s)
                </Match>
                <Match when={compilation.status === "succeed"}>
                  ✅ Compiled ({compilation.filename},{" "}
                  {compilingSec().toFixed(1)}
                  s)
                </Match>
                <Match when={compilation.status === "failed"}>
                  ❌ Compilation failed ({compilation.filename},{" "}
                  {compilingSec().toFixed(1)}
                  s)
                </Match>
                <Match when={compilation.status === "aborted"}>
                  ❌ Compilation aborted ({compilation.filename},{" "}
                  {compilingSec().toFixed(1)}
                  s)
                </Match>
                <Match when={compilation.status === "fatal"}>
                  ❌ Fatal error
                </Match>
              </Switch>
            </div>
            <Show when={compilation.err !== ""}>
              <CodeDisplayArea
                code={compilation.err}
                variant={compilation.status === "succeed" ? "normal" : "error"}
              />
            </Show>
          </div>

          <div>
            <label for="bf-code">brainf*ck</label>
            <Show when={bfCodeSize() >= 1}> ({bfCodeSize()} commands)</Show>
            <CodeArea
              id="bf-code"
              ref={bfAreaRef}
              onUpdate={_setBfCode}
              onInput={handleBfAreaInput}
              defaultValue={bfCode()}
              disabled={compilation.status === "compiling"}
            />
          </div>

          <div>
            <label for="bf-input">Input</label> ({bfInputLines()} lines)
            <CodeArea
              id="bf-input"
              ref={bfInputAreaRef}
              onUpdate={_setBfInput}
              defaultValue={bfInput()}
              readonly={isBfRunning()}
            />
          </div>

          <details>
            <summary class="settings-summary">Run Settings</summary>
            <table class="settings-table">
              <tbody>
                <tr>
                  <td>Array length</td>
                  <td>
                    <input type="number" value="100000" disabled />
                  </td>
                </tr>
              </tbody>
            </table>
          </details>

          <div class="inputs-container">
            <button
              ref={bfRunButton}
              class="input expand"
              onClick={runBf}
              disabled={!canRunBf()}
            >
              {"Run "}
              <CtrlEnterText
                disabled={ctrlEnterAction() !== "run" || !canRunBf()}
              />
            </button>
            <button
              class="input expand"
              onClick={stopBf}
              disabled={!isBfRunning()}
            >
              Stop
            </button>
          </div>
        </div>
        <div class="paragraphs-column">
          <div class="forms-column">
            <div>
              {/* TODO: あとで見直す */}
              <Switch>
                <Match when={bfCodeSize() === 0}>⏹️ No bf code to run</Match>
                <Match when={bfError() !== ""}>❌ Failed to run</Match>
                <Match when={!isBfRunning()}>🟦 Ready to run</Match>
                <Match when={isBfInputRequired()}>
                  ⏸️ Additional input required
                </Match>
                <Match when={isBfRunning()}>⌛Running ...</Match>
              </Switch>
            </div>
            <Show when={bfError() !== ""}>
              <div>
                <CodeDisplayArea code={bfError()} variant={"error"} />
              </div>
            </Show>
          </div>

          <div>
            Output
            <CodeDisplayArea
              code={bfOutput()}
              cursor={isBfRunning() ? "zerowidth" : "eof"}
            />
          </div>

          <Show when={isBfInputRequired()}>
            {/* TODO: 一度出現したら残るようにする */}
            <form onSubmit={handleSubmitBfInteractiveInput}>
              <label for="interactive-input">Additional Input</label>
              <div class="inputs-container">
                <input
                  id="interactive-input"
                  type="text"
                  ref={bfInteractiveInputRef}
                  spellcheck={false}
                  disabled={!isBfInputRequired()}
                  autocomplete="off"
                  class="input interactive-input expand"
                />
                <button
                  type="submit"
                  class="input"
                  disabled={!isBfInputRequired()}
                >
                  Enter
                </button>
              </div>
            </form>
          </Show>
        </div>
      </div>
    </div>
  );
}
