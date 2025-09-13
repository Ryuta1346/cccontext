/**
 * Simplified string width calculation
 * Handles basic ASCII, CJK characters, and common emoji
 */
export function getStringWidth(str: string): number {
  if (!str || str.length === 0) return 0;
  
  let width = 0;
  
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    
    // Handle ANSI escape sequences (skip them)
    if (code === 0x1b && i + 1 < str.length && str[i + 1] === "[") {
      // Find the end of the escape sequence
      const endIndex = str.indexOf("m", i + 2);
      if (endIndex !== -1) {
        i = endIndex;
        continue;
      }
    }
    
    // Basic ASCII (single width)
    if (code < 0x80) {
      width += 1;
    }
    // CJK Unified Ideographs and related ranges (double width)
    else if (
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0x2eff) || // CJK Radicals Supplement
      (code >= 0x2f00 && code <= 0x2fdf) || // Kangxi Radicals
      (code >= 0x3000 && code <= 0x303f) || // CJK Symbols and Punctuation
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0x3100 && code <= 0x312f) || // Bopomofo
      (code >= 0x3130 && code <= 0x318f) || // Hangul Compatibility Jamo
      (code >= 0x3190 && code <= 0x319f) || // Kanbun
      (code >= 0x31a0 && code <= 0x31bf) || // Bopomofo Extended
      (code >= 0x31c0 && code <= 0x31ef) || // CJK Strokes
      (code >= 0x31f0 && code <= 0x31ff) || // Katakana Phonetic Extensions
      (code >= 0x3200 && code <= 0x32ff) || // Enclosed CJK Letters and Months
      (code >= 0x3300 && code <= 0x33ff) || // CJK Compatibility
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Unified Ideographs Extension A
      (code >= 0x4dc0 && code <= 0x4dff) || // Yijing Hexagram Symbols
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0xa000 && code <= 0xa48f) || // Yi Syllables
      (code >= 0xa490 && code <= 0xa4cf) || // Yi Radicals
      (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
      (code >= 0xfe30 && code <= 0xfe4f) || // CJK Compatibility Forms
      (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms (Latin)
      (code >= 0xff61 && code <= 0xffdc)    // Halfwidth and Fullwidth Forms (Asian)
    ) {
      width += 2;
    }
    // Emoji and other symbols (simplified - treat as double width)
    else if (
      (code >= 0x1f300 && code <= 0x1f9ff) || // Emoji
      (code >= 0x2600 && code <= 0x27bf)     // Miscellaneous Symbols
    ) {
      width += 2;
      // Skip combining characters
      if (i + 1 < str.length) {
        const nextCode = str.charCodeAt(i + 1);
        if (nextCode === 0xfe0f || nextCode === 0xfe0e) {
          i++; // Skip variation selector
        }
      }
    }
    // Default: treat as single width
    else {
      width += 1;
    }
  }
  
  return width;
}

// Compatibility export for drop-in replacement
export default getStringWidth;