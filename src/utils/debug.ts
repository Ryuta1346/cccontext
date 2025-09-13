/**
 * Debug utilities with conditional compilation
 */

const isDev = process.env.NODE_ENV === "development";
const isDebug = process.env.CCCONTEXT_DEBUG === "true";

export const debug = {
  log: isDev || isDebug ? console.log.bind(console) : () => {},
  error: isDev || isDebug ? console.error.bind(console) : () => {},
  warn: isDev || isDebug ? console.warn.bind(console) : () => {},
  info: isDev || isDebug ? console.info.bind(console) : () => {},
};

// Remove all debug code in production builds
export function stripDebugCode(code: string): string {
  if (process.env.NODE_ENV === "production") {
    let processedCode = code;
    // Remove debug.* calls
    processedCode = processedCode.replace(/debug\.(log|error|warn|info)\([^)]*\);?/g, "");
    // Remove console.* calls
    processedCode = processedCode.replace(/console\.(log|debug|error|warn|info)\([^)]*\);?/g, "");
    return processedCode;
  }
  return code;
}
