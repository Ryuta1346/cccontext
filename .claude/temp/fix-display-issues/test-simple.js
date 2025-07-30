#!/usr/bin/env node

import blessed from 'blessed';

// テストデータ
const testData = [
  ['Session', 'Latest Prompt'],
  ['12345678', 'Hello World'],
  ['87654321', 'こんにちは世界'],
  ['abcdefgh', '日本語のテストです'],
  ['ijklmnop', 'Mixed: 日本語 and English'],
  ['qrstuvwx', '記号も含む: ！＠＃＄％']
];

// スクリーン初期化
const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  title: 'Unicode Test'
});

// テーブル作成
const table = blessed.table({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  border: {
    type: 'line'
  },
  style: {
    border: {
      fg: 'white'
    }
  },
  tags: false,  // tagsを無効化
  keys: true,
  vi: true,
  mouse: true,
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: true,
  scrollable: true
});

// データ設定
table.setData(testData);
table.focus();

// キーバインディング
screen.key(['q', 'C-c'], () => {
  process.exit(0);
});

// レンダリング
screen.render();

console.log('Unicode display test started. Press q to quit.');