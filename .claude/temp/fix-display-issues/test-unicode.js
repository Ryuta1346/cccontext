import blessed from 'blessed';
import chalk from 'chalk';

// テスト用の日本語テキスト
const testTexts = [
  'Hello World',
  'こんにちは世界',
  '日本語のテスト',
  'Mixed: 日本語 and English',
  '記号も含む: ！＠＃＄％',
  '絵文字: 😀🎉'
];

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,  // Unicodeサポートを有効化
  warnings: true
});

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
      fg: 'cyan'
    },
    header: {
      fg: 'cyan',
      bold: true
    }
  },
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: true,
  scrollable: true
});

// テーブルデータの設定
const tableData = [
  ['Type', 'Text', 'Chalk Colored'],
  ...testTexts.map((text, i) => [
    `Test ${i + 1}`,
    text,
    chalk.gray(text)
  ])
];

table.setData(tableData);
table.focus();

screen.key(['q', 'C-c'], () => {
  process.exit(0);
});

screen.render();

console.log('Press q to quit');
console.log('Testing Unicode display in blessed table...');