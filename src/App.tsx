import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-fsharp";
import {
  createEffect,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { CodeArea, CodeDisplayArea } from "./Components";
import CompileWorker from "./assets/playground.bc.js?worker";
import { FileSettings, fileSettingsList } from "./fileSettings";

function configureAceSession(session: ace.Ace.EditSession) {
  // Ace Editorの設定をここに書く
  session.setMode("ace/mode/fsharp");
  session.setTabSize(2);
  session.setUseSoftTabs(true);
}

function narrowType<T, U extends T>(o: T, f: (o: T) => o is U): U | false {
  return f(o) ? o : false;
}

export default function App() {
  const headerHeight = "3rem";
  const leftFooterHeight = "3rem";

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

  const [bfmlEditor, setBfmlEditor] = createSignal<ace.Ace.Editor | undefined>(
    undefined,
  );
  onMount(() => {
    const editor = ace.edit("editor", {
      fontSize: 14,
      // showPrintMargin: false
    });
    setBfmlEditor(editor);
  });

  const handleBeforeUnload = (event: Event) => {
    // ファイルが編集されていたら遷移時に確認する
    const changed = editingFiles
      .values()
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
  let bfArea!: HTMLTextAreaElement;

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
      bfArea.value = res.data.out;
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

    bfArea.value = "";
    setStderr("");
  };

  const handleCompileClick = compile;
  const handleStopCompileClick = () => {
    if (compilingState().t === "compiling") {
      updateCompilingState({ t: "aborted" });
    }
  };
  const handleBfmlEditorKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.repeat
    ) {
      compile();
    }
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
          <div id="editor" onKeyDown={handleBfmlEditorKeyDown} />
        </div>
        <div
          style={{
            height: leftFooterHeight,
            "justify-content": "right",
          }}
          class="valign-center"
        >
          <select ref={fileSelect} class="input" onChange={handleFileChange}>
            <For each={fileSettingsList}>
              {(setting) => (
                <option value={setting.name}>{setting.name}</option>
              )}
            </For>
          </select>
          <button
            class="input"
            onClick={handleCompileClick}
            disabled={compilingState().t === "compiling"}
          >
            Compile
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
              Compiling {compiledFileName()} ...
              <Show when={compilingSec() >= 1}>
                {" "}
                ({compilingSec().toFixed(0)}s)
              </Show>
            </Match>
            <Match when={compilingState().t === "succeed"}>
              Compiled {compiledFileName()} ({compilingSec().toFixed(1)}s)
            </Match>
            <Match when={compilingState().t === "failed"}>
              Failed to compile {compiledFileName()} (
              {compilingSec().toFixed(1)}s)
            </Match>
            <Match when={compilingState().t === "aborted"}>
              Compilation aborted ({compilingSec().toFixed(1)}s)
            </Match>
            <Match when={narrowType(compilingState(), (s) => s.t === "fatal")}>
              {(s) => <>Fatal error: {s().message}</>}
            </Match>
          </Switch>
        </div>
        <Show when={stderr() !== ""}>
          <div class="right-box">
            Standard error output:
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
          <CodeDisplayArea code={selectingFileName()} />
        </div>
      </div>
    </div>
  );
}
