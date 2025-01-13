import { Component, createRenderEffect, createUniqueId, Ref } from "solid-js";

export type BfRunSettings = {
  arrayLength: number;
};

export type BfRunSettingsRef = {
  reportValidity: () => boolean;
  values: () => BfRunSettings;
};

export const BfRunSettingsInputs: Component<{
  ref?: Ref<BfRunSettingsRef>;
}> = (props) => {
  let runSettingsDetails!: HTMLDetailsElement;
  let arrayLengthInput!: HTMLInputElement;

  createRenderEffect(() => {
    const ref = props.ref as Exclude<typeof props.ref, BfRunSettingsRef>;
    ref?.({
      reportValidity() {
        const isArrayLengthValid = arrayLengthInput.checkValidity();
        if (isArrayLengthValid) {
          return true;
        } else {
          runSettingsDetails.open = true;
          arrayLengthInput.reportValidity();
          return false;
        }
      },
      values() {
        return {
          arrayLength: arrayLengthInput.valueAsNumber,
        };
      },
    });
  });

  const arrayLengthId = createUniqueId();

  return (
    <details ref={runSettingsDetails}>
      <summary class="settings-summary">Run Settings</summary>
      <table class="settings-table">
        <tbody>
          <tr>
            <td>
              <label for={arrayLengthId}>Array length</label>
            </td>
            <td>
              <input
                ref={arrayLengthInput}
                id={arrayLengthId}
                type="number"
                value="30000"
                required
                min="1"
                max="1000000"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  );
};
