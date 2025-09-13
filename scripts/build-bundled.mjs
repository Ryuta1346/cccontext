#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function build() {
  try {
    const cliPath = join(projectRoot, 'src', 'cli.ts');
    const outPath = join(projectRoot, 'dist', 'cli.js');
    
    console.log('Building bundled version with esbuild...');
    
    const result = await esbuild.build({
      entryPoints: [cliPath],
      bundle: true,
      minify: true,
      platform: 'node',
      target: 'node18',
      format: 'esm',
      outfile: outPath,
      treeShaking: true,
      metafile: true,
      legalComments: 'none',
      pure: ['console.debug'],
      drop: ['debugger'],
      // External dependencies that should not be bundled
      external: [
        'blessed',
        'chalk', 
        'chokidar',
        'commander',
        'string-width',
        'tslib',
        'term.js',
        'pty.js'
      ],
      // Bundle only our code, not dependencies
      packages: 'external',
      // Optimize for size
      minifyWhitespace: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      // Add shebang
      banner: {
        js: '#!/usr/bin/env node',
      },
    });

    // Add executable permissions
    const fs = await import('fs/promises');
    await fs.chmod(outPath, 0o755);
    
    // Get the file size
    const stats = await fs.stat(outPath);
    const size = stats.size;
    
    console.log(`✅ Bundle complete!`);
    console.log(`   Output: ${outPath}`);
    console.log(`   Size: ${(size / 1024).toFixed(1)}KB`);

    // Save bundle analysis
    if (process.argv.includes('--analyze')) {
      const analysisPath = join(projectRoot, 'bundle-analysis.txt');
      const analysis = await esbuild.analyzeMetafile(result.metafile, {
        verbose: true,
      });
      writeFileSync(analysisPath, analysis);
      console.log(`\n📊 Bundle analysis saved to: bundle-analysis.txt`);
      
      const metafilePath = join(projectRoot, 'bundle-meta.json');
      writeFileSync(metafilePath, JSON.stringify(result.metafile, null, 2));
      console.log(`📋 Metafile saved to: bundle-meta.json`);
    }

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the build
build();