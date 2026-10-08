import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../dist/index.js');
const examplesDir = path.resolve(__dirname, '../examples/sample-components');

describe('MCP v2 server integration', () => {
  const toolNames = [
    'analyze_jsx_props',
    'find_prop_usage',
    'find_jsx',
    'check_jsx',
    'get_component_props',
    'find_components_without_prop',
  ];

  function createMCPClient() {
    const client = new Client(
      { name: 'jsx-prop-lookup-test-client', version: '2.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } }
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: path.resolve(__dirname, '..'),
    });

    return { client, transport };
  }

  async function withMCPClient(callback) {
    const { client, transport } = createMCPClient();
    try {
      await client.connect(transport);
      return await callback(client);
    } finally {
      await client.close();
    }
  }

  function parseTextResult(result) {
    const textBlock = result.content?.find((block) => block.type === 'text');
    assert.ok(textBlock, 'Tool result should contain a text block');
    return JSON.parse(textBlock.text);
  }

  test('negotiates the MCP 2.0 protocol', async () => {
    await withMCPClient(async (client) => {
      assert.strictEqual(client.getServerVersion()?.name, 'jsx-prop-lookup-server');
      const metadata = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
      );
      assert.strictEqual(client.getServerVersion()?.version, metadata.version);
      assert.strictEqual(client.getNegotiatedProtocolVersion(), '2026-07-28');
      assert.strictEqual(client.getProtocolEra(), 'modern');
    });
  });

  test('lists exactly the supported tools', async () => {
    await withMCPClient(async (client) => {
      const { tools } = await client.listTools();
      assert.deepStrictEqual(
        tools.map((tool) => tool.name).sort(),
        [...toolNames].sort(),
        'Tool inventory should match the supported API'
      );
      assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
    });
  });

  test('calls analyze_jsx_props through the v2 client', async () => {
    await withMCPClient(async (client) => {
      const result = await client.callTool({
        name: 'analyze_jsx_props',
        arguments: { path: examplesDir },
      });
      const analysis = parseTextResult(result);

      assert.ok(analysis.summary);
      assert.ok(analysis.components);
      assert.ok(analysis.propUsages);
      assert.ok(analysis.summary.totalFiles >= 4);
    });
  });

  test('calls find_prop_usage through the v2 client', async () => {
    await withMCPClient(async (client) => {
      const result = await client.callTool({
        name: 'find_prop_usage',
        arguments: { propName: 'onClick', directory: examplesDir },
      });
      const usages = parseTextResult(result);

      assert.ok(Array.isArray(usages));
      assert.ok(usages.length > 0);
      assert.ok(usages[0].propName);
      assert.ok(usages[0].componentName);
      assert.ok(usages[0].file);
      assert.strictEqual(typeof usages[0].line, 'number');
      assert.strictEqual(typeof usages[0].column, 'number');
    });
  });

  test('calls get_component_props through the v2 client', async () => {
    await withMCPClient(async (client) => {
      const result = await client.callTool({
        name: 'get_component_props',
        arguments: { componentName: 'Button', directory: examplesDir },
      });
      const components = parseTextResult(result);

      assert.ok(Array.isArray(components));
      assert.ok(components.length > 0);
      assert.strictEqual(components[0].componentName, 'Button');
      assert.ok(Array.isArray(components[0].props));
      assert.ok(components[0].props.length > 0);
    });
  });

  test('calls find_components_without_prop through the v2 client', async () => {
    await withMCPClient(async (client) => {
      const result = await client.callTool({
        name: 'find_components_without_prop',
        arguments: {
          componentName: 'Select',
          requiredProp: 'width',
          directory: examplesDir,
        },
      });
      const analysis = parseTextResult(result);

      assert.ok(Array.isArray(analysis.missingPropUsages));
      assert.ok(analysis.summary);
      assert.strictEqual(typeof analysis.summary.totalInstances, 'number');
      assert.strictEqual(typeof analysis.summary.missingPropCount, 'number');
      assert.strictEqual(typeof analysis.summary.missingPropPercentage, 'number');
    });
  });

  test('returns tool errors without terminating the connection', async () => {
    await withMCPClient(async (client) => {
      const result = await client.callTool({
        name: 'analyze_jsx_props',
        arguments: { path: '/non/existent/path' },
      });

      assert.strictEqual(result.isError, true);
      assert.ok(result.content?.[0]?.type === 'text');
      assert.match(result.content[0].text, /Cannot access path: \/non\/existent\/path/);
      const recovered = await client.callTool({
        name: 'find_prop_usage',
        arguments: { directory: examplesDir, propName: 'onClick', componentName: 'Button' },
      });
      assert.strictEqual(recovered.isError, undefined);
      const usages = parseTextResult(recovered);
      assert.ok(usages.some((usage) => usage.value === 'handleIncrement'));
    });
  });

  test('returns validation errors for missing arguments', async () => {
    await withMCPClient(async (client) => {
      const result = await client.callTool({
        name: 'find_prop_usage',
        arguments: {},
      });

      assert.strictEqual(result.isError, true);
      assert.ok(result.content?.[0]?.type === 'text');
      const errorText = result.content[0].text.toLowerCase();
      assert.ok(
        errorText.includes('invalid') ||
          errorText.includes('required') ||
          errorText.includes('validation') ||
          errorText.includes('error')
      );
    });
  });

  test('reports parse failures as tool errors and keeps the connection usable', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-mcp-parse-error-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'Broken.tsx');
    fs.writeFileSync(file, 'const view = <Button width={');
    await withMCPClient(async (client) => {
      for (const request of [
        { name: 'analyze_jsx_props', arguments: { path: file } },
        { name: 'find_prop_usage', arguments: { directory, propName: 'width' } },
        { name: 'get_component_props', arguments: { directory, componentName: 'Button' } },
        {
          name: 'find_components_without_prop',
          arguments: {
            directory,
            componentName: 'Button',
            requiredProp: 'width',
          },
        },
      ]) {
        const result = await client.callTool(request);
        assert.equal(result.isError, true, request.name);
        assert.match(result.content[0].text, /Failed to parse .*Broken\.tsx/);
      }
      assert.equal((await client.listTools()).tools.length, toolNames.length);
    });
  });

  test('handles relative paths from the project working directory', async () => {
    await withMCPClient(async (client) => {
      const result = await client.callTool({
        name: 'find_prop_usage',
        arguments: {
          propName: 'onClick',
          directory: './examples/sample-components',
        },
      });

      assert.ok(result.content);
      assert.strictEqual(result.isError, undefined);
    });
  });
});
