/**
 * Adapter to allow switching between string-width package and custom implementation
 */

// Feature flag to switch implementations
export const USE_CUSTOM_STRING_WIDTH = process.env.CCCONTEXT_CUSTOM_STRING_WIDTH === "true";

let stringWidthFn: (str: string) => number;

if (USE_CUSTOM_STRING_WIDTH) {
  // Use custom lightweight implementation
  const { getStringWidth } = await import("./string-width.js");
  stringWidthFn = getStringWidth;
} else {
  // Use string-width package (default for now)
  const stringWidth = await import("string-width");
  stringWidthFn = stringWidth.default;
}

export default stringWidthFn;
export { stringWidthFn as stringWidth };