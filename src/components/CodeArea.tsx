import {
  Component,
  createRenderEffect,
  mergeProps,
  onMount,
  Ref,
} from "solid-js";

const defaultRows = 8;

// uncontrolled な編集可能テキストエリア
export type CodeAreaRef = {
  value: () => string;
  update: (value: string) => void;
};
export const CodeArea: Component<{
  ref?: Ref<CodeAreaRef>;
  defaultValue?: string;
  disabled?: boolean;
  readonly?: boolean;
  onUpdate?: (value: string) => void; // 値が更新されたときに発火。初回および外側から更新された場合も発火する
  onInput?: (event: InputEvent) => void;
  id?: string;
}> = (props) => {
  let textarea!: HTMLTextAreaElement;
  createRenderEffect(() => {
    (props.ref as Exclude<typeof props.ref, CodeAreaRef>)?.({
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
      ref={textarea}
      onInput={handleInput}
      spellcheck={false}
      classList={{
        "code-area": true,
        "code-input-area": true,
        "code-input-area-disabled": props.disabled,
      }}
      rows={defaultRows}
      disabled={props.disabled}
      readOnly={props.readonly}
      id={props.id}
    />
  );
};

export const CodeDisplayArea: Component<{
  code: string;
  variant?: "normal" | "error";
  showEof?: boolean;
}> = (_props) => {
  const props = mergeProps({ variant: "normal" }, _props);
  return (
    <pre
      classList={{
        "code-area": true,
        "code-display-area": true,
        [`code-display-area-variant-${props.variant}`]: true,
        "code-display-area-show-eof": props.showEof,
        "code-display-area-empty": !props.showEof && props.code === "",
      }}
    >
      {props.code}
    </pre>
  );
};
