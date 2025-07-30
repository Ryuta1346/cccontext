#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionWatcher } from '../../../src/monitor/session-watcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function simulateCompactOperation(filePath, originalContent, compactedContent) {
  console.log('\n=== Simulating /compact operation ===');
  console.log(`Original size: ${Buffer.byteLength(originalContent)} bytes`);
  console.log(`Compacted size: ${Buffer.byteLength(compactedContent)} bytes`);
  console.log(`Size reduction: ${Buffer.byteLength(originalContent) - Buffer.byteLength(compactedContent)} bytes`);
  
  // Method 1: Direct overwrite (what Claude Code might do)
  console.log('\nMethod 1: Direct overwrite');
  await fs.promises.writeFile(filePath, compactedContent);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Method 2: Atomic replacement (write to temp, then rename)
  console.log('\nMethod 2: Atomic replacement');
  const tempPath = filePath + '.tmp';
  await fs.promises.writeFile(filePath, originalContent); // Reset
  await new Promise(resolve => setTimeout(resolve, 500));
  await fs.promises.writeFile(tempPath, compactedContent);
  await fs.promises.rename(tempPath, filePath);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Method 3: Truncate and write
  console.log('\nMethod 3: Truncate and write');
  await fs.promises.writeFile(filePath, originalContent); // Reset
  await new Promise(resolve => setTimeout(resolve, 500));
  await fs.promises.truncate(filePath, 0);
  await fs.promises.writeFile(filePath, compactedContent);
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function testCompactDetection() {
  const testDir = path.join(__dirname, 'test-sessions');
  const testFile = path.join(testDir, 'test-session.jsonl');
  
  // Ensure test directory exists
  await fs.promises.mkdir(testDir, { recursive: true });
  
  // Create original session content (larger)
  const originalContent = [
    { timestamp: new Date().toISOString(), type: 'assistant', message: { role: 'assistant', content: 'Hello! I can help you with coding.', usage: { input_tokens: 10, output_tokens: 20 } } },
    { timestamp: new Date().toISOString(), type: 'user', message: { role: 'user', content: 'I need help with a React component that manages state.' } },
    { timestamp: new Date().toISOString(), type: 'assistant', message: { role: 'assistant', content: 'I\'d be happy to help you with a React component. Here\'s an example of a component with state management using hooks...', usage: { input_tokens: 50, output_tokens: 200 } } },
    { timestamp: new Date().toISOString(), type: 'user', message: { role: 'user', content: 'Can you show me how to use useEffect?' } },
    { timestamp: new Date().toISOString(), type: 'assistant', message: { role: 'assistant', content: 'Certainly! useEffect is a Hook that lets you perform side effects in function components. Here\'s how to use it...', usage: { input_tokens: 30, output_tokens: 150 } } },
  ].map(msg => JSON.stringify(msg)).join('\n') + '\n';
  
  // Create compacted content (much smaller)
  const compactedContent = [
    { timestamp: new Date().toISOString(), type: 'system', message: { role: 'system', content: '[Previous conversation summary: User asked about React state management and useEffect hook. Assistant provided examples.]' } },
    { timestamp: new Date().toISOString(), type: 'assistant', message: { role: 'assistant', content: 'Previous conversation compacted.', usage: { input_tokens: 100, output_tokens: 400 } } }
  ].map(msg => JSON.stringify(msg)).join('\n') + '\n';
  
  // Write initial content
  await fs.promises.writeFile(testFile, originalContent);
  
  // Create watcher
  const watcher = new SessionWatcher();
  let detectionCount = 0;
  
  watcher.on('session-data', ({ sessionId, sessionData }) => {
    console.log(`\n[DETECTED] Session update for ${sessionId}`);
    console.log(`Total tokens: ${sessionData?.totalTokens || 0}`);
    console.log(`File size change detected!`);
    detectionCount++;
  });
  
  watcher.on('session-updated', ({ sessionId }) => {
    console.log(`[EVENT] session-updated: ${sessionId}`);
  });
  
  // Start watching
  await watcher.watchSession('test-session', testFile);
  await new Promise(resolve => setTimeout(resolve, 500)); // Let watcher initialize
  
  // Run compact simulation
  await simulateCompactOperation(testFile, originalContent, compactedContent);
  
  // Check results
  console.log(`\n=== Test Results ===`);
  console.log(`Total detections: ${detectionCount}`);
  console.log(`Expected: 3 (one for each method)`);
  
  // Cleanup
  watcher.stopAll();
  await fs.promises.rm(testDir, { recursive: true });
}

// Run test
testCompactDetection().catch(console.error);