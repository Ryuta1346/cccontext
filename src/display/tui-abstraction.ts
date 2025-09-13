// SessionData type is used in implementations but not in this abstract interface

// Generic data type for update method
export type ViewData = unknown;

export interface TUIScreen {
  init(): void;
  destroy(): void;
  render(): void;
  onKey(callback: (key: string) => void): void;
  clearScreen(): void;
}

export interface TUIBox {
  setContent(content: string): void;
  setStyle(style: BoxStyle): void;
  hide(): void;
  show(): void;
}

export interface TUITable {
  setData(headers: string[], rows: string[][]): void;
  setSelectedRow(index: number): void;
  getSelectedRow(): number;
  onSelect(callback: (index: number) => void): void;
}

export interface BoxStyle {
  fg?: string;
  bg?: string;
  border?: {
    fg?: string;
  };
}

export interface TUIOptions {
  title?: string;
  fullUnicode?: boolean;
}

export interface TUIProvider {
  createScreen(options?: TUIOptions): TUIScreen;
  createBox(parent: TUIScreen, options: BoxOptions): TUIBox;
  createTable(parent: TUIScreen, options: TableOptions): TUITable;
}

export interface BoxOptions {
  top?: number | string;
  left?: number | string;
  width?: number | string;
  height?: number | string;
  content?: string;
  label?: string;
  border?: boolean | { type: string };
  style?: BoxStyle;
}

export interface TableOptions {
  top?: number | string;
  left?: number | string;
  width?: number | string;
  height?: number | string;
  headers?: string[];
  border?: boolean | { type: string };
  style?: BoxStyle;
}

export abstract class BaseLiveView {
  protected screen: TUIScreen | null = null;
  protected provider: TUIProvider;

  constructor(provider: TUIProvider) {
    this.provider = provider;
  }

  abstract init(): void;
  abstract update(data: ViewData): void;
  abstract destroy(): void;

  protected setupKeyboardHandlers(): void {
    if (!this.screen) return;

    this.screen.onKey((key: string) => {
      if (key === "q" || key === "\u0003") {
        // q or Ctrl+C
        this.destroy();
        process.exit(0);
      }
    });
  }
}
