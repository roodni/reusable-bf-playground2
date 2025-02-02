import ace from "ace-builds";
import {
  Component,
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
import { createStore } from "solid-js/store";
import CompileWorker from "../assets/playground.bc.js?worker";
import * as BfOptimizer from "../bf/optimizer";
import * as BfParser from "../bf/parser";
import * as BfRunner from "../bf/runner";
import { FileSettings, fileSettingsList } from "../misc/fileSettings";
import { BfmlMode } from "../misc/highlighter.js";
import { BfRunSettingsInputs, BfRunSettingsRef } from "./BfRunSettings";
import { CodeArea, CodeAreaRef, CodeDisplayArea } from "./CodeArea";
import { CompileSettingsInputs, CompileSettingsRef } from "./CompileSettings";

import("ace-builds/src-noconflict/ext-searchbox"); // ext-searchboxは使用時に初めて参照されるので、動的importでチャンクサイズを減らしてみる

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

  //
  // エディタに関すること
  //
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

  // ファイル選択
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
  createEffect(() => {
    const editor = bfmlEditor();
    if (!editor) {
      return;
    }
    const file = selectingFile();

    const name = file.settings.name;
    let session = sessions.get(name);
    if (!session) {
      const s = ace.createEditSession(file.settings.code, new BfmlMode());
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

  //
  // コンパイルに関すること
  //
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

  // コンパイル中はエディタをreadonlyにする
  createEffect(() => {
    const editor = bfmlEditor();
    const compiling = compilation.status === "compiling";
    if (!editor) {
      return;
    }
    editor.setReadOnly(compiling);
  });

  let stopCompile = () => {};
  const handleStopCompileButtonClick = () => {
    stopCompile();
  };

  let compileSettingsRef!: CompileSettingsRef;

  const canCompile = () => compilation.status !== "compiling" && !isBfRunning();
  const compile = async () => {
    if (!canCompile()) {
      return;
    }

    const settings = compileSettingsRef.values();

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
          const succeed: boolean = res.data.success;
          setCompilation({
            status: succeed ? "succeed" : "failed",
            err: res.data.err,
          });
          if (succeed && !isBfRunning()) {
            // コンパイルに成功したら、bf実行のステータスを消す
            setRunResult({
              status: "ready",
              error: "",
              output: "",
            });
          }
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
      if (settings.timeoutMsec !== undefined) {
        timeoutTimer = window.setTimeout(abort, settings.timeoutMsec);
      }

      worker.postMessage({
        files,
        entrypoint: filename,
        showLayout: settings.showLayouts,
        optimize: settings.optimizationLevel,
        maxLength: 1000000,
      });
    });

    worker.terminate();
    updateTime();
    window.clearInterval(elapsedTimeTimer);
    window.clearTimeout(timeoutTimer);

    callback();
  };

  // bfコードが直接編集されたらコンパイルのステータスを消す
  // もはやコンパイル結果ではなくなるので
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

  //
  // インタプリタに関すること
  //
  let bfInputAreaRef!: CodeAreaRef;
  let bfAdditionalInputRef!: HTMLInputElement;
  let bfOutputElement!: HTMLElement;

  // 入力
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

  // 実行
  type RunResult = {
    status: "ready" | "running" | "finished" | "error" | "aborted";
    isInputRequired: boolean;
    additionalInputUsed: boolean; // 追加入力が一度でも要求されたかどうか
    error: string;
    output: string;
    elapsedTime: number;
  };
  const [runResult, setRunResult] = createStore<RunResult>({
    status: "ready",
    isInputRequired: false,
    additionalInputUsed: false,
    error: "",
    output: "",
    elapsedTime: 0,
  });
  const bfElapsedTimeResultText = () => {
    const t = (runResult.elapsedTime / 1000).toFixed(1) + "s";
    return t;
    // return runResult.additionalInputUsed ? `${t} with input wait` : t;
  };
  const isBfRunning = () => runResult.status === "running";

  let bfRunner = new BfRunner.Runner();
  let bfStartTime = 0;
  let bfTimer: number | undefined;

  const afterBfTerminated = () => {
    window.clearTimeout(bfTimer);
    setRunResult({
      isInputRequired: false,
      elapsedTime: Date.now() - bfStartTime,
    });
    bfRunner = new BfRunner.Runner();
    if (!focuses.run) {
      // フォーカスがない場合 (=~ 実行ボタンを押してdisabledでフォーカスが消えた場合)、出力エリアにフォーカスする。
      // 出力がすべて画面内に入るようにするため。
      // Ctrl + Enterで実行する場合はフォーカスが残るので、例えばInputを編集しながら連続で実行することができる
      bfOutputElement.focus();
    }
  };
  const handleBfRunnerEvent = (ev: BfRunner.RunnerEvent) => {
    switch (ev.t) {
      case "input":
        setRunResult({
          isInputRequired: true,
          additionalInputUsed: true,
        });
        bfAdditionalInputRef.focus();
        break;
      case "output": {
        // メモリ食いつぶし防止のため、出力文字数には制限を設ける
        // あまり綺麗ではない。うまい方法を探したい
        const output = (runResult.output + ev.output).slice(-10000);
        setRunResult({ output });
        break;
      }
      case "finish":
        setRunResult({ status: "finished" });
        afterBfTerminated();
        break;
      case "error": {
        const error = (() => {
          switch (ev.kind) {
            case "pointer":
              return "Error: Pointer out of range";
            case "overflow":
              return "Error: Wrap-around is prohibited";
            case "fatal":
              return "Fatal error";
          }
        })();
        setRunResult({ status: "error", error });
        afterBfTerminated();
        break;
      }
    }
  };

  let bfRunSettingsRef!: BfRunSettingsRef;

  const canRunBf = () => !isBfRunning() && bfCodeSize() !== 0;
  const runBf = () => {
    if (!canRunBf()) {
      return;
    }
    if (!bfRunSettingsRef.reportValidity()) {
      return;
    }
    const bfRunSettings = bfRunSettingsRef.values();

    setRunResult({
      status: "running",
      error: "",
      output: "",
      additionalInputUsed: false,
      elapsedTime: 0,
    });
    bfStartTime = Date.now();
    bfTimer = window.setInterval(() => {
      setRunResult({ elapsedTime: Date.now() - bfStartTime });
    }, 1000);

    const code = bfCode();
    const parseResult = BfParser.parse(code);
    if (parseResult.t === "error") {
      const msg = `Syntax Error: ${parseResult.msg} (line ${parseResult.line}, col ${parseResult.col})`;
      setRunResult({
        status: "error",
        error: msg,
      });
      return;
    }

    const optimized = BfOptimizer.optimize(parseResult.commands);
    // const optimized = parseResult.commands;
    const input = bfInput();
    bfRunner.run(optimized, input, handleBfRunnerEvent, {
      arrayLength: bfRunSettings.arrayLength,
      cellType: bfRunSettings.cellType,
      encoding: bfRunSettings.encoding,
      disableWrapAround: bfRunSettings.disableWrapAround,
    });
  };
  const stopBf = () => {
    if (isBfRunning()) {
      bfRunner.abort();
      setRunResult({ status: "aborted" });
      afterBfTerminated();
    }
  };

  // 追加入力を送信する。ただし、最後の改行より後の文字は送信しない
  const submitBfAdditionalInput = (input: string) => {
    if (isBfRunning() && !runResult.isInputRequired) {
      return;
    }
    const lines = input.split("\n");
    console.log(lines);
    if (lines.length >= 2) {
      bfAdditionalInputRef.value = lines.pop()!;
      const i = lines.join("\n") + "\n";
      setRunResult("output", (s) => s + i);
      setRunResult("isInputRequired", false);
      bfRunner.input(i);
    }
  };

  const handleSubmitBfAdditionalInput = (ev: SubmitEvent) => {
    submitBfAdditionalInput(bfAdditionalInputRef.value + "\n");
    ev.preventDefault();
  };

  const handlePasteOnAdditionalInput = (ev: ClipboardEvent) => {
    // 改行を含む文字列のペーストを扱えるようにする
    const clip = ev.clipboardData?.getData("text/plain") ?? "";
    const start = bfAdditionalInputRef.selectionStart;
    const end = bfAdditionalInputRef.selectionEnd;
    console.log(clip, start, end);
    if (!clip.includes("\n") || start === null || end === null) {
      return;
    }
    ev.preventDefault();
    const current = bfAdditionalInputRef.value;
    const left = current.slice(0, start);
    const right = current.slice(end);
    submitBfAdditionalInput(left + clip + right);
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
      <div class="header">
        <h1 class="header-title">Reusable-bf Playground</h1>
        <div>
          🔗
          <a href="https://github.com/roodni/reusable-bf" target="_blank">
            GitHub
          </a>
        </div>
      </div>

      {/* 左 */}
      <div
        class="left"
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
            disabled={
              !selectingFile().isChanged || compilation.status === "compiling"
            }
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
      <div class="right sections-column">
        <div
          class="paragraphs-column"
          onFocusIn={() => setFocuses("bfmlSettings", true)}
          onFocusOut={() => setFocuses("bfmlSettings", false)}
        >
          <CompileSettingsInputs ref={compileSettingsRef} disabled={false} />
        </div>

        <div
          class="paragraphs-column"
          onFocusIn={() => setFocuses("run", true)}
          onFocusOut={() => setFocuses("run", false)}
        >
          <div class="forms-column">
            <div class="status">
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
            <label for="bf-code">brainf**k</label> ({bfCodeSize()} commands)
            <CodeArea
              id="bf-code"
              ref={bfAreaRef}
              onUpdate={_setBfCode}
              onInput={handleBfAreaInput}
              defaultValue={bfCode()}
              disabled={compilation.status === "compiling"}
              readonly={isBfRunning()}
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

          <div class="inputs-container">
            <button class="input expand" onClick={runBf} disabled={!canRunBf()}>
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

          <BfRunSettingsInputs ref={bfRunSettingsRef} disabled={false} />
        </div>

        <div class="paragraphs-column">
          <div class="forms-column">
            <div class="status">
              <Switch>
                <Match when={runResult.status === "ready"}>
                  🟦 Ready to run
                </Match>
                <Match
                  when={
                    runResult.status === "running" && runResult.isInputRequired
                  }
                >
                  ⏸️ Additional input required
                </Match>
                <Match when={runResult.status === "running"}>
                  ⌛ Running ... ({(runResult.elapsedTime / 1000).toFixed(0)}s)
                </Match>
                <Match when={runResult.status === "finished"}>
                  ✅ Run finished ({bfElapsedTimeResultText()})
                </Match>
                <Match when={runResult.status === "error"}>
                  ❌ Run failed ({bfElapsedTimeResultText()})
                </Match>
                <Match when={runResult.status === "aborted"}>
                  ❌ Run aborted ({bfElapsedTimeResultText()})
                </Match>
              </Switch>
            </div>
            <Show when={runResult.error !== ""}>
              <div>
                <CodeDisplayArea code={runResult.error} variant={"error"} />
              </div>
            </Show>
          </div>

          <div>
            Output
            <Show when={!isBfRunning() && runResult.additionalInputUsed}>
              {" "}
              (with Additional Input)
            </Show>
            <CodeDisplayArea
              code={runResult.output}
              cursor={isBfRunning() ? "zerowidth" : "eof"}
              ref={bfOutputElement}
            />
          </div>

          <Show when={isBfRunning() && runResult.additionalInputUsed}>
            <form onSubmit={handleSubmitBfAdditionalInput}>
              {/* 複数行のコピペに対応したい */}
              <label for="interactive-input">Additional Input</label>
              <div class="inputs-container">
                <input
                  id="interactive-input"
                  type="text"
                  ref={bfAdditionalInputRef}
                  onPaste={handlePasteOnAdditionalInput}
                  disabled={!runResult.isInputRequired}
                  spellcheck={false}
                  autocomplete="off"
                  class="input interactive-input expand"
                />
                <button
                  type="submit"
                  class="input"
                  disabled={!runResult.isInputRequired}
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
