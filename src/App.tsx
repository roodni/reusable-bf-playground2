import { createSignal } from 'solid-js';
import { Button } from '@suid/material';
import svg from './assets/solid.svg';

function App() {
  const [count, setCount] = createSignal(0);

  return (
    <>
      <h1>I DO NOT LIKE WEB FRONTENND ({count()})</h1>
      <Button onClick={() => setCount(count() + 1)} variant='contained'>ボタン</Button>
      <img src={svg}/>
    </>
  );
}

export default App;