#!/usr/bin/env node

// Test MCP server with simple error case
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, 'src/index.ts');

console.log('Testing MCP server error handling...');

const server = spawn('node', ['--import=tsx', serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let responseBuffer = '';
let requestId = 1;

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  console.log('Server output:', data.toString());

  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || '';

  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('Parsed response:', JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('Non-JSON output:', line);
      }
    }
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
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

console.log('Sending initialize request...');
server.stdin.write(JSON.stringify(initRequest) + '\n');

// Wait a bit then send tool call with invalid arguments
setTimeout(() => {
  console.log('Sending tool call with invalid arguments...');
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

  // Wait for response then timeout
  setTimeout(() => {
    console.log('Test timeout - closing server');
    server.kill();
  }, 5000);
}, 1000);

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
});
