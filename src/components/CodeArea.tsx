import {
  Component,
  createRenderEffect,
  mergeProps,
  onMount,
  Ref,
} from "solid-js";

const defaultRows = 6;

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
  cursor?: "none" | "eof" | "zerowidth";
  ref?: Ref<HTMLElement>;
}> = (_props) => {
  const props = mergeProps({ variant: "normal", cursor: "none" }, _props);

  let preElement!: HTMLPreElement;
  const refFunc = (el: HTMLPreElement) => {
    preElement = el;
    const refProp = props.ref as Exclude<typeof props.ref, Element>;
    refProp?.(el);
  };

  const handleKeyDown = (ev: KeyboardEvent) => {
    // 全選択を可能にする
    if (ev.key === "a" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(preElement);
      selection?.addRange(range);
    }
  };
  return (
    <pre
      classList={{
        "code-area": true,
        "code-display-area": true,
        [`code-display-area-variant-${props.variant}`]: true,
        [`code-display-area-cursor-${props.cursor}`]: true,
      }}
      tabindex={0}
      ref={(el) => refFunc(el)}
      onKeyDown={handleKeyDown}
    >
      {props.code}
    </pre>
  );
};
