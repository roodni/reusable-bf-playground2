import {
  Component,
  createRenderEffect,
  mergeProps,
  onMount,
  Ref,
} from "solid-js";

const defaultRows = 8;

// uncontrolled な編集可能テキストエリア
export type CodeAreaAPI = {
  value: () => string;
  update: (value: string) => void;
};
export const CodeArea: Component<{
  ref?: Ref<CodeAreaAPI>;
  defaultValue?: string;
  disabled?: boolean;
  onUpdate?: (value: string) => void; // 値が更新されたときに発火。初回および外側から更新された場合も発火する
  onInput?: (event: InputEvent) => void;
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
  const handleInput = (event: InputEvent) => {
    props.onUpdate?.(textarea.value);
    props.onInput?.(event);
  };
  return (
    <textarea
      ref={textarea!}
      onInput={handleInput}
      classList={{
        "code-area": true,
        "code-input-area": true,
        "code-input-area-disabled": props.disabled,
      }}
      rows={defaultRows}
      disabled={props.disabled}
    />
  );
};

export const CodeDisplayArea: Component<{
  code: string;
  style?: "normal" | "error";
}> = (_props) => {
  const props = mergeProps({ style: "normal" }, _props);
  return (
    <pre
      classList={{
        "code-area": true,
        "code-display-area": true,
        [`code-display-area-${props.style}`]: true,
      }}
    >
      {props.code}
    </pre>
  );
};
