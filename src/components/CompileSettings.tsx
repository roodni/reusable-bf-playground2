import { Component, createRenderEffect, createUniqueId, Ref } from "solid-js";

export type CompileSettings = {
  showLayouts: boolean;
  optimizationLevel: number;
  timeoutMsec: number | undefined;
};

export type CompileSettingsRef = {
  values: () => CompileSettings;
};

export const CompileSettingsInputs: Component<{
  ref?: Ref<CompileSettingsRef>;
  disabled: boolean;
}> = (props) => {
  let showLayoutCheckbox!: HTMLInputElement;
  let optimizationLevelSelect!: HTMLSelectElement;
  let timeoutSelect!: HTMLSelectElement;

  createRenderEffect(() => {
    const ref = props.ref as Exclude<typeof props.ref, CompileSettingsRef>;
    ref?.({
      values() {
        const timeoutSec = parseInt(timeoutSelect.value);
        return {
          showLayouts: showLayoutCheckbox.checked,
          optimizationLevel: parseInt(optimizationLevelSelect.value),
          timeoutMsec: timeoutSec > 0 ? timeoutSec * 1000 : undefined,
        };
      },
    });
  });

  const showLayoutsId = createUniqueId();
  const optimizationLevelId = createUniqueId();
  const timeoutId = createUniqueId();

  return (
    <details>
      <summary class="settings-summary">Compilation Settings</summary>
      <table class="settings-table">
        <tbody>
          <tr>
            <td>
              <label for={showLayoutsId}>Show layouts</label>
            </td>
            <td>
              <input
                ref={showLayoutCheckbox}
                id={showLayoutsId}
                type="checkbox"
                class="settings-checkbox"
                disabled={props.disabled}
              />
            </td>
          </tr>
          <tr>
            <td>
              <label for={optimizationLevelId}>Optimization level</label>
            </td>
            <td>
              <select
                ref={optimizationLevelSelect}
                id={optimizationLevelId}
                disabled={props.disabled}
              >
                <option value="0">0 (No optimization)</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3" selected>
                  3 (Max)
                </option>
              </select>
            </td>
          </tr>
          <tr>
            <td>
              <label for={timeoutId}>Timeout</label>
            </td>
            <td>
              <select
                ref={timeoutSelect}
                id={timeoutId}
                disabled={props.disabled}
              >
                <option value="5">5 s</option>
                <option value="0">Never</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  );
};
