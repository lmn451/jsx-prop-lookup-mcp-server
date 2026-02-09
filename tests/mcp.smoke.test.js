import { test, describe } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../src/index.ts');
const examplesDir = path.resolve(__dirname, '../examples/sample-components');

describe('MCP Server Integration', () => {
  function createMCPClient() {
    const server = spawn('node', ['--import=tsx', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let responseBuffer = '';
    let pendingRequests = new Map();
    let requestId = 1;

    server.stdout.on('data', (data) => {
      responseBuffer += data.toString();

      // Try to parse complete JSON messages
      const lines = responseBuffer.split('\n');
      responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            if (response.id && pendingRequests.has(response.id)) {
              const resolve = pendingRequests.get(response.id);
              pendingRequests.delete(response.id);
              resolve(response);
            }
          } catch (e) {
            // Ignore non-JSON lines (like startup messages)
          }
        }
      }
    });

    const sendRequest = (method, params = {}) => {
      return new Promise((resolve, reject) => {
        const id = requestId++;
        const request = {
          jsonrpc: '2.0',
          id,
          method,
          params,
        };

        pendingRequests.set(id, resolve);

        server.stdin.write(JSON.stringify(request) + '\n');

        // Timeout after 10 seconds
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error(`Request ${method} timed out`));
          }
        }, 10000);
      });
    };

    const close = () => {
      server.kill();
    };

    return { sendRequest, close };
  }

  test('should initialize MCP server', async () => {
    const client = createMCPClient();

    try {
      const response = await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.capabilities, 'Should have capabilities');
      assert.ok(response.result.serverInfo, 'Should have server info');
      assert.strictEqual(
        response.result.serverInfo.name,
        'jsx-prop-lookup-server',
        'Server name should match'
      );
    } finally {
      client.close();
    }
  });

  test('should list available tools', async () => {
    const client = createMCPClient();

    try {
      // Initialize first
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/list');

      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.tools, 'Should have tools array');
      assert.strictEqual(response.result.tools.length, 4, 'Should have 4 tools');

      const toolNames = response.result.tools.map((t) => t.name);
      assert.ok(toolNames.includes('analyze_jsx_props'), 'Should have analyze_jsx_props tool');
      assert.ok(toolNames.includes('find_prop_usage'), 'Should have find_prop_usage tool');
      assert.ok(toolNames.includes('get_component_props'), 'Should have get_component_props tool');
      assert.ok(
        toolNames.includes('find_components_without_prop'),
        'Should have find_components_without_prop tool'
      );
    } finally {
      client.close();
    }
  });

  test('should call analyze_jsx_props tool', async () => {
    const client = createMCPClient();

    try {
      // Initialize
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'analyze_jsx_props',
        arguments: {
          path: examplesDir,
        },
      });

      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.content, 'Should have content');
      assert.strictEqual(response.result.content[0].type, 'text', 'Content should be text');

      const result = JSON.parse(response.result.content[0].text);
      assert.ok(result.summary, 'Should have summary');
      assert.ok(result.components, 'Should have components');
      assert.ok(result.propUsages, 'Should have propUsages');
      assert.ok(result.summary.totalFiles >= 4, 'Should analyze multiple files');
    } finally {
      client.close();
    }
  });

  test('should call find_prop_usage tool', async () => {
    const client = createMCPClient();

    try {
      // Initialize
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'find_prop_usage',
        arguments: {
          propName: 'onClick',
          directory: examplesDir,
        },
      });

      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.content, 'Should have content');

      const result = JSON.parse(response.result.content[0].text);
      assert.ok(Array.isArray(result), 'Should return array of usages');
      assert.ok(result.length > 0, 'Should find onClick usages');

      // Verify usage structure
      const usage = result[0];
      assert.ok(usage.propName, 'Should have propName');
      assert.ok(usage.componentName, 'Should have componentName');
      assert.ok(usage.file, 'Should have file');
      assert.ok(typeof usage.line === 'number', 'Should have line number');
      assert.ok(typeof usage.column === 'number', 'Should have column number');
    } finally {
      client.close();
    }
  });

  test('should call get_component_props tool', async () => {
    const client = createMCPClient();

    try {
      // Initialize
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'get_component_props',
        arguments: {
          componentName: 'Button',
          directory: examplesDir,
        },
      });

      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.content, 'Should have content');

      const result = JSON.parse(response.result.content[0].text);
      assert.ok(Array.isArray(result), 'Should return array of components');
      assert.ok(result.length > 0, 'Should find Button component');

      const component = result[0];
      assert.strictEqual(component.componentName, 'Button', 'Should be Button component');
      assert.ok(Array.isArray(component.props), 'Should have props array');
      assert.ok(component.props.length > 0, 'Should have props');
    } finally {
      client.close();
    }
  });

  test('should call find_components_without_prop tool', async () => {
    const client = createMCPClient();

    try {
      // Initialize
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'find_components_without_prop',
        arguments: {
          componentName: 'Select',
          requiredProp: 'width',
          directory: examplesDir,
        },
      });

      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.content, 'Should have content');

      const result = JSON.parse(response.result.content[0].text);
      assert.ok(result.missingPropUsages, 'Should have missingPropUsages');
      assert.ok(result.summary, 'Should have summary');
      assert.ok(Array.isArray(result.missingPropUsages), 'Missing usages should be array');

      // Verify summary structure
      assert.ok(typeof result.summary.totalInstances === 'number', 'Should have totalInstances');
      assert.ok(
        typeof result.summary.missingPropCount === 'number',
        'Should have missingPropCount'
      );
      assert.ok(typeof result.summary.missingPropPercentage === 'number', 'Should have percentage');
    } finally {
      client.close();
    }
  });

  test('should handle tool errors gracefully', async () => {
    const client = createMCPClient();

    try {
      // Initialize
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'analyze_jsx_props',
        arguments: {
          path: '/non/existent/path',
        },
      });

      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.content, 'Should have content');
      assert.strictEqual(response.result.isError, true, 'Should be marked as error');
      assert.ok(response.result.content[0].text.includes('Error:'), 'Should contain error message');
    } finally {
      client.close();
    }
  });

  test('should handle missing arguments', async () => {
    const client = createMCPClient();

    try {
      // Initialize
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'find_prop_usage',
        arguments: {}, // Missing required propName
      });

      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.content, 'Should have content');
      assert.strictEqual(response.result.isError, true, 'Should be marked as error');
      // SEP-1303: Check for validation error indicators (not specific text)
      const errorText = response.result.content[0].text.toLowerCase();
      assert.ok(
        errorText.includes('invalid') ||
          errorText.includes('required') ||
          errorText.includes('validation') ||
          errorText.includes('error'),
        'Error message should explain the validation failure'
      );
    } finally {
      client.close();
    }
  });

  test('should handle relative paths', async () => {
    const client = createMCPClient();

    try {
      // Initialize
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'find_prop_usage',
        arguments: {
          propName: 'onClick',
          directory: './examples/sample-components', // Relative path
        },
      });

      // This might succeed or fail depending on working directory
      // The important thing is it doesn't crash the server
      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.content, 'Should have content');
    } finally {
      client.close();
    }
  });
});
