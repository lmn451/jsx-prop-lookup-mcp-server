#!/usr/bin/env node

// Test what error Zod returns for missing arguments
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, 'src/index.ts');

console.log('Testing missing arguments error message...');

const server = spawn('node', ['--import=tsx', serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let responseBuffer = '';
let requestId = 1;

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();

  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || '';

  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('Response:', JSON.stringify(response, null, 2));
      } catch (e) {
        // Ignore non-JSON
      }
    }
  }
});

server.stderr.on('data', (data) => {
  console.error('Server:', data.toString());
});

// Send initialize request
const initRequest = {
  jsonrpc: '2.0',
  id: requestId++,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
};

server.stdin.write(JSON.stringify(initRequest) + '\n');

// Wait a bit then send tool call with missing arguments
setTimeout(() => {
  console.log('\nSending tool call with MISSING arguments...');
  const toolRequest = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: 'find_prop_usage',
      arguments: {}, // Missing required propName
    },
  };

  server.stdin.write(JSON.stringify(toolRequest) + '\n');

  setTimeout(() => {
    console.log('\nTest timeout - closing server');
    server.kill();
  }, 3000);
}, 1000);

server.on('close', (code) => {
  console.log(`\nServer process exited with code ${code}`);
});
