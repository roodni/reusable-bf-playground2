import {
  Component,
  createEffect,
  createRenderEffect,
  onMount,
  Ref,
} from "solid-js";

// uncontrolled な編集可能テキストエリア
export type CodeAreaAPI = {
  value: () => string;
  update: (value: string) => void;
};
export const CodeArea: Component<{
  ref?: Ref<CodeAreaAPI>;
  onUpdate?: (value: string) => void; // 値が更新されたときに発火。初回および外側から更新された場合も発火する
  defaultValue?: string;
}> = (props) => {
  let textarea: HTMLTextAreaElement;
  createRenderEffect(() => {
    (props.ref as Exclude<typeof props.ref, CodeAreaAPI>)?.({
      value() {
        return textarea.value;
      },
      update(value) {
        textarea.value = value;
        props.onUpdate?.(value);
      },
    });
  });
  onMount(() => {
    const value = props.defaultValue ?? "";
    textarea.value = value;
    props.onUpdate?.(value);
  });
  const handleInput = () => {
    props.onUpdate?.(textarea.value);
  };
  return (
    <textarea
      ref={textarea!}
      onInput={handleInput}
      class="code-area"
      rows={7}
    />
  );
};

export const CodeDisplayArea: Component<{
  code: string;
}> = (props) => {
  let textarea!: HTMLTextAreaElement;
  createEffect(() => {
    textarea.value = props.code;
  });
  return <textarea ref={textarea} class="code-area" readonly rows={7} />;
};
