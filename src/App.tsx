import { createSignal } from 'solid-js'
import { Button } from '@suid/material'

function App() {
  const [count, setCount] = createSignal(0)

  return (
    <>
      <h1>I DO NOT LIKE WEB FRONTENND ({count()})</h1>
      <Button onClick={() => setCount(count() + 1)} variant='contained'>ボタン</Button>
    </>
  )
}

export default App
