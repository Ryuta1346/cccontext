#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function build() {
  const isWatch = process.argv.includes('--watch');
  const analyze = process.argv.includes('--analyze');
  
  console.log(`🔨 Building CLI application${isWatch ? ' (watch mode)' : ''}...`);
  
  const buildOptions = {
    entryPoints: [join(projectRoot, 'src', 'cli.ts')],
    bundle: true,
    minify: !isWatch,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: join(projectRoot, 'dist', 'cli.js'),
    
    // Optimization settings for production
    treeShaking: true,
    minifyIdentifiers: !isWatch,
    minifyWhitespace: !isWatch,
    minifySyntax: !isWatch,
    
    // Remove debug code and comments
    legalComments: 'none',
    drop: isWatch ? [] : ['console', 'debugger'],
    pure: isWatch ? [] : ['console.log', 'console.warn', 'console.error', 'console.debug', 'console.trace', 'console.info'],
    
    // No source maps for production
    sourcemap: isWatch ? 'inline' : false,
    
    // External dependencies that should not be bundled
    // These are large native modules or optional dependencies
    external: [
      'blessed',
      'chokidar',
      'fsevents', // macOS file watching (optional)
    ],
    
    // Bundle all other dependencies
    packages: 'external',
    
    // Add shebang for CLI execution
    banner: {
      js: '#!/usr/bin/env node',
    },
    
    // Enable metafile for bundle analysis
    metafile: analyze,
    
    // Define environment variables
    define: {
      'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
    },
  };

  try {
    if (isWatch) {
      // Watch mode
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('👀 Watching for changes...');
    } else {
      // Build mode
      const result = await esbuild.build(buildOptions);
      
      // Make the output file executable
      const outPath = buildOptions.outfile;
      await fs.chmod(outPath, 0o755);
      
      // Get file size
      const stats = await fs.stat(outPath);
      const size = stats.size;
      
      console.log(`✅ Build complete!`);
      console.log(`   Output: ${outPath}`);
      console.log(`   Size: ${(size / 1024).toFixed(1)}KB`);
      
      // Bundle analysis
      if (analyze && result.metafile) {
        const analysisPath = join(projectRoot, 'bundle-analysis.txt');
        const analysis = await esbuild.analyzeMetafile(result.metafile, {
          verbose: true,
        });
        await fs.writeFile(analysisPath, analysis);
        console.log(`\n📊 Bundle analysis saved to: bundle-analysis.txt`);
        
        const metafilePath = join(projectRoot, 'bundle-meta.json');
        await fs.writeFile(metafilePath, JSON.stringify(result.metafile, null, 2));
        console.log(`📋 Metafile saved to: bundle-meta.json`);
      }
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run the build
build();