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

type EditingFile = {
  session: ace.Ace.EditSession | undefined;
  settings: FileSettings;
};

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

  const [compilingState, setCompilingState] = createSignal<CompilingState>({
    t: "ready",
  });

  const handleCompileClick = () => {
    if (compilingState().t === "compiling") {
      return;
    }
    const worker = new CompileWorker();
    setCompilingState({ t: "compiling", worker });
    worker.addEventListener("message", (res) => {
      worker.terminate();
      setStderr(res.data.err);
      bfArea.value = res.data.out;
      setCompilingState({ t: res.data.success ? "succeed" : "failed" });
    });
    worker.addEventListener("error", (e) => {
      worker.terminate();
      console.error(e);
      setCompilingState({ t: "fatal" });
    });
    const files = editingFiles
      .values()
      .map((f) => ({
        name: f.settings.name,
        content: f.session?.getValue() ?? f.settings.code,
      }))
      .toArray();
    worker.postMessage({
      files,
      entrypoint: selectingFileName(),
      optimize: 3,
      showLayout: false,
      maxLength: 1000000,
    });
    bfArea.value = "";
    setStderr("");
  };

  const handleStopCompileClick = () => {
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
