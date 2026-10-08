import { McpServer } from '@modelcontextprotocol/server';
import { ProjectWorkspace, type ProjectOptions } from './project.js';
import { registerFindJsxTool } from './find-jsx.js';
import { registerInspectComponentTool } from './inspect-component.js';
import { registerCheckJsxTool } from './check-jsx.js';
import { createLegacyServer } from './legacy-server.js';
import { PACKAGE_VERSION } from './version.js';

export interface ServerOptions extends ProjectOptions {
  legacyTools?: boolean;
}

/** Create a server without starting a transport or adding process listeners. */
export function createServer(options: readonly string[] | ServerOptions = {}): McpServer {
  if (Array.isArray(options)) return createLegacyServer(options);
  const configured = options as ServerOptions;
  if (configured.legacyTools) {
    return createLegacyServer(
      configured.root !== undefined || configured.tsconfig !== undefined
        ? configured
        : configured.allowedRoots ?? []
    );
  }
  const project = new ProjectWorkspace(configured);
  const server = new McpServer({ name: 'jsx-prop-lookup-server', version: PACKAGE_VERSION });
  registerFindJsxTool(server, project);
  registerInspectComponentTool(server, project);
  registerCheckJsxTool(server, project);
  return server;
}
