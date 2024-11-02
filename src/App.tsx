// import { createSignal } from 'solid-js';
import { Component } from 'solid-js';
import './App.css';

const Textarea: Component<{}> = () => {
  return (
    <textarea
      rows={7}
      style={{
        width: '100%',
        resize: 'none',
        display: 'block'
      }}
    >
    </textarea>
  );
};

export default function App() {
  const headerHeight = '3rem';
  const leftFooterHeight = '3rem';

  return (
    <div style={{
      display: 'flex',
      'flex-wrap': 'wrap'
    }}>
      {/* ヘッダー */}
      <div
          style={{
            width: '100%',
            height: headerHeight,
            'background-color': 'burlywood'
          }}
          class='valign-center'
        >
        <div style={{'font-size': '1.5rem'}} class='right-box'>
          Reusable-bf Playground
        </div>
      </div>
      
      {/* 左 */}
      <div
        style={{
          width: '50%',
          height: `calc(100svh - ${headerHeight})`,
          'background-color': 'olive',
          padding: '4px',
        }}
      >
        <div
          style={{
            height: `calc(100% - ${leftFooterHeight})`,
          }}
        >
          <textarea
            style={{
              width: '100%',
              height: '100%',
              resize: 'none',
            }}
          >
          </textarea>
        </div>
        <div
          style={{height: leftFooterHeight}}
          class='valign-center'
        >
          <select class='input'>
            <option>sandbox.bfml</option>
            <option>examples/hello.bfml</option>
            <option>std.bfml</option>
          </select>
          <button class='input'>
            Compile
          </button>
        </div>
      </div>

      {/* 右 */}
      <div
        style={{
          width: '50%',
          height: `calc(100svh - ${headerHeight})`,
          'background-color': 'peachpuff',
        }}
      >
        <div class='right-box'>
          Error
        </div>
        <div class='right-box'>
          brainf**k:
          <Textarea></Textarea>
        </div>
        <div class='right-box'>
          Input:
          <Textarea></Textarea>
          <button class='input'>Run</button>
          <button class='input' disabled>Stop</button>
        </div>
        <div class='right-box'>
          Output:
          <Textarea></Textarea>
        </div>
      </div>
    </div>
  );
}
