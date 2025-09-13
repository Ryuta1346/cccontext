#!/usr/bin/env node

import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

console.log("Building ultra-optimized bundle...");

// Build configuration for maximum optimization
const buildOptions = {
  entryPoints: [path.join(rootDir, "src/cli-optimized.ts")],
  bundle: true,
  minify: true,
  treeShaking: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outdir: path.join(rootDir, "dist"),
  
  // Aggressive minification
  minifyIdentifiers: true,
  minifyWhitespace: true,
  minifySyntax: true,
  
  // Remove all comments
  legalComments: "none",
  
  // Drop debug code
  drop: ["console", "debugger"],
  
  // Keep imports external to reduce bundle size
  external: [
    "blessed",
    "chalk",
    "chokidar",
    "commander",
    "string-width",
    "cli-table3",
    "tslib"
  ],
  
  // Add shebang
  banner: {
    js: "#!/usr/bin/env node"
  },
  
  // Define production environment
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.CCCONTEXT_DEBUG": '"false"'
  },
  
  // Enable metafile for bundle analysis
  metafile: true,
  
  // Code splitting for dynamic imports
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  
  // Pure functions for better tree-shaking
  pure: ["console.log", "console.debug", "console.info"],
};

async function build() {
  try {
    const result = await esbuild.build(buildOptions);
    
    // Write metafile for analysis
    if (result.metafile) {
      fs.writeFileSync(
        path.join(rootDir, "dist/meta-ultra.json"),
        JSON.stringify(result.metafile, null, 2)
      );
      
      // Calculate bundle size
      let totalSize = 0;
      for (const file in result.metafile.outputs) {
        totalSize += result.metafile.outputs[file].bytes;
      }
      
      console.log("✅ Ultra-optimized bundle complete!");
      console.log(`   Output: ${buildOptions.outdir}`);
      console.log(`   Total Size: ${(totalSize / 1024).toFixed(1)}KB`);
      
      // Show chunk sizes if splitting enabled
      const chunks = Object.keys(result.metafile.outputs).filter(f => f.includes("chunks/"));
      if (chunks.length > 0) {
        console.log(`   Chunks: ${chunks.length} files`);
        chunks.forEach(chunk => {
          const size = result.metafile.outputs[chunk].bytes;
          console.log(`     - ${path.basename(chunk)}: ${(size / 1024).toFixed(1)}KB`);
        });
      }
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

// Run build
build();