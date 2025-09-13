// @ts-ignore - cli-table3 will be installed later
import Table from "cli-table3";
import chalk from "chalk";
import type {
  TUIScreen,
  TUIBox,
  TUITable,
  TUIProvider,
  TUIOptions,
  BoxOptions,
  TableOptions,
  BoxStyle,
} from "./tui-abstraction.js";

class LightweightScreen implements TUIScreen {
  private keyCallbacks: ((key: string) => void)[] = [];
  private boxes: LightweightBox[] = [];
  private tables: LightweightTable[] = [];
  private refreshInterval: NodeJS.Timeout | null = null;
  
  init(): void {
    this.clearScreen();
    this.hideCursor();
    this.setupKeyboard();
    
    // Start refresh loop
    this.refreshInterval = setInterval(() => this.render(), 100);
  }
  
  destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.showCursor();
    this.clearScreen();
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  
  render(): void {
    this.clearScreen();
    
    // Render all boxes
    for (const box of this.boxes) {
      box.render();
    }
    
    // Render all tables
    for (const table of this.tables) {
      table.render();
    }
  }
  
  onKey(callback: (key: string) => void): void {
    this.keyCallbacks.push(callback);
  }
  
  clearScreen(): void {
    process.stdout.write("\x1b[2J\x1b[H");
  }
  
  private hideCursor(): void {
    process.stdout.write("\x1b[?25l");
  }
  
  private showCursor(): void {
    process.stdout.write("\x1b[?25h");
  }
  
  private setupKeyboard(): void {
    if (!process.stdin.isTTY) return;
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    
    process.stdin.on("data", (key: string) => {
      for (const callback of this.keyCallbacks) {
        callback(key);
      }
    });
  }
  
  addBox(box: LightweightBox): void {
    this.boxes.push(box);
  }
  
  addTable(table: LightweightTable): void {
    this.tables.push(table);
  }
}

class LightweightBox implements TUIBox {
  private content: string = "";
  private style: BoxStyle = {};
  private visible: boolean = true;
  private options: BoxOptions;
  
  constructor(options: BoxOptions) {
    this.options = options;
    if (options.content) {
      this.content = options.content;
    }
    if (options.style) {
      this.style = options.style;
    }
  }
  
  setContent(content: string): void {
    this.content = content;
  }
  
  setStyle(style: BoxStyle): void {
    this.style = style;
  }
  
  hide(): void {
    this.visible = false;
  }
  
  show(): void {
    this.visible = true;
  }
  
  render(): void {
    if (!this.visible) return;
    
    let output = this.content;
    
    // Apply styles
    if (this.style.fg) {
      const colorKey = this.style.fg;
      // Using dynamic color access with proper type checking
      const chalkColors = chalk as typeof chalk & Record<string, (text: string) => string>;
      if (colorKey && colorKey in chalkColors && typeof chalkColors[colorKey] === 'function') {
        output = chalkColors[colorKey](output);
      }
    }
    
    // Add label if present
    if (this.options.label) {
      output = `${chalk.cyan(this.options.label)}\n${output}`;
    }
    
    // Position cursor if needed
    const top = this.parsePosition(this.options.top);
    const left = this.parsePosition(this.options.left);
    
    if (top !== null && left !== null) {
      process.stdout.write(`\x1b[${top};${left}H`);
    }
    
    process.stdout.write(`${output}\n`);
  }
  
  private parsePosition(pos: number | string | undefined): number | null {
    if (pos === undefined) return null;
    if (typeof pos === "number") return pos;
    if (pos.endsWith("%")) {
      // Handle percentage (simplified)
      return null;
    }
    return parseInt(pos, 10);
  }
}

class LightweightTable implements TUITable {
  private headers: string[] = [];
  private rows: string[][] = [];
  private selectedRow: number = 0;
  private selectCallbacks: ((index: number) => void)[] = [];
  private options: TableOptions;
  
  constructor(options: TableOptions) {
    this.options = options;
    if (options.headers) {
      this.headers = options.headers;
    }
  }
  
  setData(headers: string[], rows: string[][]): void {
    this.headers = headers;
    this.rows = rows;
  }
  
  setSelectedRow(index: number): void {
    this.selectedRow = Math.max(0, Math.min(index, this.rows.length - 1));
  }
  
  getSelectedRow(): number {
    return this.selectedRow;
  }
  
  onSelect(callback: (index: number) => void): void {
    this.selectCallbacks.push(callback);
  }
  
  render(): void {
    const table = new Table({
      head: this.headers.map(h => chalk.cyan.bold(h)),
      style: {
        head: [],
        border: [],
      },
      chars: {
        top: "─",
        "top-mid": "┬",
        "top-left": "┌",
        "top-right": "┐",
        bottom: "─",
        "bottom-mid": "┴",
        "bottom-left": "└",
        "bottom-right": "┘",
        left: "│",
        "left-mid": "├",
        mid: "─",
        "mid-mid": "┼",
        right: "│",
        "right-mid": "┤",
        middle: "│",
      },
    });
    
    // Add rows with selection highlighting
    this.rows.forEach((row, index) => {
      if (index === this.selectedRow) {
        table.push(row.map(cell => chalk.black.bgCyan(cell)));
      } else {
        table.push(row);
      }
    });
    
    // Position cursor if needed
    const top = this.parsePosition(this.options.top);
    const left = this.parsePosition(this.options.left);
    
    if (top !== null && left !== null) {
      process.stdout.write(`\x1b[${top};${left}H`);
    }
    
    process.stdout.write(table.toString());
  }
  
  private parsePosition(pos: number | string | undefined): number | null {
    if (pos === undefined) return null;
    if (typeof pos === "number") return pos;
    if (pos.endsWith("%")) {
      // Handle percentage (simplified)
      return null;
    }
    return parseInt(pos, 10);
  }
}

export class LightweightTUIProvider implements TUIProvider {
  createScreen(_options?: TUIOptions): TUIScreen {
    return new LightweightScreen();
  }
  
  createBox(parent: TUIScreen, options: BoxOptions): TUIBox {
    const box = new LightweightBox(options);
    if (parent instanceof LightweightScreen) {
      parent.addBox(box);
    }
    return box;
  }
  
  createTable(parent: TUIScreen, options: TableOptions): TUITable {
    const table = new LightweightTable(options);
    if (parent instanceof LightweightScreen) {
      parent.addTable(table);
    }
    return table;
  }
}