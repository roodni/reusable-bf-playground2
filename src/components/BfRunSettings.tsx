import { Component, createRenderEffect, createUniqueId, Ref } from "solid-js";
import type { CellType } from "../bf/runner";

export type BfRunSettings = {
  arrayLength: number;
  cellType: CellType;
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
  let cellTypeSelect!: HTMLSelectElement;

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
          cellType: cellTypeSelect.value as CellType,
        };
      },
    });
  });

  const arrayLengthId = createUniqueId();
  const cellTypeId = createUniqueId();

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
          <tr>
            <td>
              <label for={cellTypeId}>Cell type</label>
            </td>
            <td>
              <select id={cellTypeId} ref={cellTypeSelect}>
                <option value="uint8">8bit (0-255)</option>
                <option value="uint16">16bit (0-65536)</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  );
};
