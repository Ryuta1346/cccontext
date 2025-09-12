#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Check if TypeScript build output exists
const distPath = join(projectRoot, 'dist');
if (!existsSync(distPath)) {
  console.error('Error: dist directory not found. Please run "npm run build:prod" first.');
  process.exit(1);
}

async function build() {
  try {
    // Minify the CLI entry point
    const cliPath = join(distPath, 'cli.js');
    const cliOutPath = join(distPath, 'cli.min.js');
    
    console.log('Minifying cli.js...');
    
    const result = await esbuild.build({
      entryPoints: [cliPath],
      bundle: false, // Don't bundle, just minify the TypeScript output
      minify: true,
      platform: 'node',
      target: 'node18',
      format: 'esm',
      outfile: cliOutPath,
      treeShaking: true,
      metafile: true,
      legalComments: 'none', // Remove all comments including license comments
      pure: ['console.debug'], // Remove debug statements
      drop: ['debugger'], // Remove debugger statements
    });

    // Get the file sizes before replacement
    const fs = await import('fs/promises');
    const originalStats = await fs.stat(cliPath);
    const minifiedStats = await fs.stat(cliOutPath);
    const originalSize = originalStats.size;
    const minifiedSize = minifiedStats.size;
    
    // Replace original with minified version
    const minifiedContent = readFileSync(cliOutPath, 'utf-8');
    writeFileSync(cliPath, minifiedContent);
    
    // Remove the temporary minified file
    await fs.unlink(cliOutPath);
    
    // Calculate size reduction
    const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
    
    console.log(`✅ Minification complete!`);
    console.log(`   Original: ${(originalSize / 1024).toFixed(1)}KB`);
    console.log(`   Minified: ${(minifiedSize / 1024).toFixed(1)}KB`);
    console.log(`   Reduction: ${reduction}%`);

    // If --analyze flag is passed, output detailed analysis
    if (process.argv.includes('--analyze')) {
      const analysisPath = join(projectRoot, 'bundle-analysis.txt');
      const analysis = await esbuild.analyzeMetafile(result.metafile, {
        verbose: true,
      });
      writeFileSync(analysisPath, analysis);
      console.log(`\n📊 Bundle analysis saved to: bundle-analysis.txt`);
      
      // Also save the raw metafile for further analysis
      const metafilePath = join(projectRoot, 'bundle-meta.json');
      writeFileSync(metafilePath, JSON.stringify(result.metafile, null, 2));
      console.log(`📋 Metafile saved to: bundle-meta.json`);
    }

    // Minify all other JavaScript files in dist
    const glob = await import('glob');
    const jsFiles = await glob.glob('dist/**/*.js', {
      ignore: ['dist/cli.js', 'dist/**/*.min.js'],
      cwd: projectRoot,
    });

    if (jsFiles.length > 0) {
      console.log(`\nMinifying ${jsFiles.length} additional JavaScript files...`);
      
      for (const file of jsFiles) {
        const filePath = join(projectRoot, file);
        const tempPath = filePath + '.min';
        
        await esbuild.build({
          entryPoints: [filePath],
          bundle: false,
          minify: true,
          platform: 'node',
          target: 'node18',
          format: 'esm',
          outfile: tempPath,
          legalComments: 'none',
        });
        
        // Replace original with minified
        const minified = readFileSync(tempPath, 'utf-8');
        writeFileSync(filePath, minified);
        await fs.unlink(tempPath);
      }
      
      console.log(`✅ All files minified successfully!`);
    }

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the build
build();