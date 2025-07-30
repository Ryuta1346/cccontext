#!/usr/bin/env node

import { SessionWatcher } from '../../../src/monitor/session-watcher.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testRealCompact() {
  console.log('Starting real-time /compact detection test...\n');
  
  // Create watcher for the Claude Code projects directory
  const projectsDir = '/Users/ryuta/.claude/projects';
  const watcher = new SessionWatcher(projectsDir);
  
  // Listen for compact detection
  watcher.on('compact-detected', ({ sessionId, filePath }) => {
    console.log(`\n✅ COMPACT DETECTED!`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`File: ${filePath}`);
  });
  
  watcher.on('session-data', (sessionData) => {
    console.log(`\n📊 Session Update:`);
    console.log(`Session ID: ${sessionData.sessionId}`);
    console.log(`Total Tokens: ${sessionData.totalTokens}`);
    console.log(`Turns: ${sessionData.turns}`);
    console.log(`Is Compacted: ${sessionData.isCompacted || false}`);
  });
  
  watcher.on('session-updated', ({ sessionId, filePath }) => {
    console.log(`\n🔄 Session file changed: ${sessionId}`);
  });
  
  watcher.on('error', ({ sessionId, error }) => {
    console.error(`\n❌ Error in session ${sessionId}:`, error.message);
  });
  
  // Start directory watching
  await watcher.startDirectoryWatch();
  
  // Find current cccontext session
  const allFiles = await watcher.getAllJsonlFiles();
  const cccontextSessions = allFiles
    .filter(f => f.filePath.includes('cccontext'))
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  
  if (cccontextSessions.length > 0) {
    const currentSession = cccontextSessions[0];
    console.log(`\n🎯 Monitoring current cccontext session:`);
    console.log(`File: ${currentSession.filePath}`);
    console.log(`Session ID: ${path.basename(currentSession.filePath, '.jsonl')}`);
    
    // Start watching the current session
    const sessionId = path.basename(currentSession.filePath, '.jsonl');
    await watcher.watchSession(sessionId, currentSession.filePath);
    
    console.log('\n⏳ Now execute /compact in Claude Code and watch for detection...');
    console.log('Press Ctrl+C to exit.\n');
  } else {
    console.log('❌ No cccontext sessions found');
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\nStopping monitor...');
  process.exit(0);
});

// Run the test
testRealCompact().catch(console.error);