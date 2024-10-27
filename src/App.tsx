import { createSignal } from 'solid-js';

export default function SelectAutoWidth() {
  const [age, setAge] = createSignal(1);

  setAge(1);

  return (
    <div>
      助けてくれ{age()}
    </div>
  );
}
