/**
 * Lightweight table implementation to replace cli-table3
 * Optimized for minimal size while maintaining essential functionality
 */

import stringWidth from 'string-width';

export interface TableOptions {
  head?: string[];
  colWidths?: number[];
  style?: {
    head?: string[];
    border?: string[];
  };
}

export class LightTable {
  private rows: string[][] = [];
  private head?: string[];
  private colWidths: number[] = [];
  
  constructor(options: TableOptions = {}) {
    this.head = options.head;
    if (options.colWidths) {
      this.colWidths = options.colWidths;
    }
  }
  
  push(row: (string | number | undefined)[]) {
    this.rows.push(row.map(cell => String(cell ?? '')));
  }
  
  toString(): string {
    const allRows = this.head ? [this.head, ...this.rows] : this.rows;
    
    // Calculate column widths if not provided
    if (this.colWidths.length === 0 && allRows.length > 0) {
      const colCount = Math.max(...allRows.map(row => row.length));
      this.colWidths = new Array(colCount).fill(0);
      
      for (const row of allRows) {
        for (let i = 0; i < row.length; i++) {
          const width = stringWidth(row[i] || '');
          const currentWidth = this.colWidths[i];
          if (currentWidth !== undefined && width > currentWidth) {
            this.colWidths[i] = width;
          }
        }
      }
      
      // Add padding
      this.colWidths = this.colWidths.map(w => w + 2);
    }
    
    const lines: string[] = [];
    const separator = this.createSeparator();
    
    // Add top border
    lines.push(separator);
    
    // Add header if exists
    if (this.head) {
      lines.push(this.formatRow(this.head));
      lines.push(separator);
    }
    
    // Add rows
    for (const row of this.rows) {
      lines.push(this.formatRow(row));
    }
    
    // Add bottom border
    lines.push(separator);
    
    return lines.join('\n');
  }
  
  private formatRow(row: string[]): string {
    const cells = row.map((cell, i) => {
      const width = this.colWidths[i] || 10;
      const cellWidth = stringWidth(cell);
      const padding = Math.max(0, width - cellWidth - 2);
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ` ${' '.repeat(leftPad)}${cell}${' '.repeat(rightPad)} `;
    });
    return `│${cells.join('│')}│`;
  }
  
  private createSeparator(): string {
    const parts = this.colWidths.map(width => '─'.repeat(width));
    return `┌${parts.join('┬')}┐`;
  }
}

// Compatibility layer for cli-table3
export default LightTable;