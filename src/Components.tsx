import { Component, createEffect } from "solid-js";

export const CodeArea: Component<{
  ref?: HTMLTextAreaElement | ((el: HTMLTextAreaElement) => void);
}> = (props) => {
  return <textarea ref={props.ref} class="code-area" rows={7} />;
};

export const CodeDisplayArea: Component<{
  code: string;
}> = (props) => {
  let textarea: HTMLTextAreaElement;
  createEffect(() => {
    textarea.value = props.code;
  });
  return <textarea ref={textarea} class="code-area" readonly rows={7} />;
};
