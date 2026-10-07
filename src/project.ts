import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import ts from 'typescript';

export interface ProjectOptions {
  root?: string;
  allowedRoots?: readonly string[];
  tsconfig?: string;
}

const extensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'build']);

function pathKey(file: string): string {
  return ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase();
}

function contains(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

interface IgnoreFile {
  directory: string;
  rules: Ignore;
}

// TypeScript exposes this walker at runtime, but not in its public declarations.
// Keep TypeScript pinned: using its matcher preserves tsconfig glob semantics while
// directory callbacks see only our already validated, ignore-filtered snapshot.
const matchFiles = (
  ts as unknown as {
    matchFiles(
      path: string,
      extensions: readonly string[],
      excludes: readonly string[] | undefined,
      includes: readonly string[],
      useCaseSensitiveFileNames: boolean,
      currentDirectory: string,
      depth: number | undefined,
      getFileSystemEntries: (path: string) => { files: string[]; directories: string[] },
      realpath: (path: string) => string
    ): string[];
  }
).matchFiles;

/** Root-scoped filesystem and project selection shared by the CLI and MCP tools. */
export class ProjectWorkspace {
  readonly root: string;
  private readonly allowedRoots: readonly string[];
  private readonly configuredRoot: string;
  private readonly tsconfig?: string;

  constructor(options: ProjectOptions = {}) {
    this.configuredRoot = resolve(options.root ?? process.cwd());
    this.root = realpathSync.native(this.configuredRoot);
    if (!statSync(this.root).isDirectory()) {
      throw new Error(`Project root is not a directory: ${this.root}`);
    }
    this.allowedRoots = options.allowedRoots ?? [];
    this.tsconfig = options.tsconfig;
    this.checkAllowedRoots(this.root);
  }

  private checkAllowedRoots(candidate: string): void {
    if (
      this.allowedRoots.length &&
      !this.allowedRoots.some((root) => {
        try {
          return contains(realpathSync.native(resolve(root)), candidate);
        } catch {
          return false;
        }
      })
    ) {
      throw new Error(`Access to path outside allowed roots: ${candidate}`);
    }
  }

  private lexicalPath(input: string): string {
    if (!input) throw new Error('Path must be a non-empty string');
    const absolute = resolve(this.root, input);
    if (contains(this.configuredRoot, absolute)) {
      return resolve(this.root, relative(this.configuredRoot, absolute));
    }
    if (!contains(this.root, absolute)) {
      throw new Error(`Access to path outside project root: ${absolute}`);
    }
    return absolute;
  }

  /** Resolve an existing path without allowing lexical or symlink escapes. */
  resolve(input: string): string {
    const absolute = this.lexicalPath(input);
    const canonical = realpathSync.native(absolute);
    if (!contains(this.root, canonical)) {
      throw new Error(`Access to path outside project root: ${absolute}`);
    }
    this.checkAllowedRoots(canonical);
    return canonical;
  }

  /** Reading deliberately does not apply discovery filters (e.g. imported types). */
  readFile(input: string): string {
    return readFileSync(this.resolve(input), 'utf8');
  }

  private scan(): string[] {
    const files = new Map<string, string>();
    const walk = (directory: string, inherited: IgnoreFile[], ancestors: Set<string>) => {
      const canonical = this.resolve(directory);
      if (ancestors.has(canonical)) return;
      const nextAncestors = new Set(ancestors).add(canonical);
      const ignorePath = join(directory, '.gitignore');
      const rules = existsSync(ignorePath)
        ? [
            ...inherited,
            {
              directory,
              rules: ignore({ ignorecase: !ts.sys.useCaseSensitiveFileNames }).add(
                this.readFile(ignorePath)
              ),
            },
          ]
        : inherited;
      for (const name of readdirSync(canonical).sort()) {
        const candidate = join(directory, name);
        if (excludedDirectories.has(name)) continue;
        const info = statSync(this.resolve(candidate));
        const directoryEntry = info.isDirectory();
        let ignored = false;
        for (const file of rules) {
          const rel =
            relative(file.directory, candidate).split(sep).join('/') + (directoryEntry ? '/' : '');
          const result = file.rules.test(rel);
          if (result.ignored) ignored = true;
          else if (result.unignored) ignored = false;
        }
        if (ignored) continue;
        if (directoryEntry) walk(candidate, rules, nextAncestors);
        else if (extensions.has(extname(name)) && info.isFile()) {
          const source = this.resolve(candidate);
          files.set(pathKey(source), source);
        }
      }
    };
    walk(this.root, [], new Set());
    return [...files.values()].sort();
  }

  private configuration(files: string[]): ts.ParsedCommandLine | undefined {
    const configPath = this.lexicalPath(this.tsconfig ?? 'tsconfig.json');
    if (this.tsconfig === undefined && !existsSync(configPath)) return undefined;
    this.resolve(configPath);
    const directories = new Map<string, { files: string[]; directories: string[] }>();
    const entry = (directory: string) => {
      const key = pathKey(directory);
      let value = directories.get(key);
      if (!value) {
        value = { files: [], directories: [] };
        directories.set(key, value);
      }
      return value;
    };
    for (const file of files) {
      let directory = dirname(file);
      entry(directory).files.push(basename(file));
      while (directory !== this.root) {
        const parent = dirname(directory);
        const name = basename(directory);
        if (!entry(parent).directories.includes(name)) entry(parent).directories.push(name);
        directory = parent;
      }
    }
    const fileExists = (file: string): boolean => {
      const candidate = this.lexicalPath(file);
      return existsSync(candidate) && statSync(this.resolve(candidate)).isFile();
    };
    const host: ts.ParseConfigHost = {
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
      readFile: (file) => (fileExists(file) ? this.readFile(file) : undefined),
      fileExists,
      readDirectory: (directory, extensionList, excludes, includes, depth) => {
        return matchFiles(
          directory,
          extensionList,
          excludes,
          includes,
          ts.sys.useCaseSensitiveFileNames,
          this.root,
          depth,
          (candidate) => {
            return (
              directories.get(pathKey(this.lexicalPath(candidate))) ?? {
                files: [],
                directories: [],
              }
            );
          },
          (candidate) => this.lexicalPath(candidate)
        );
      },
    };
    const loaded = ts.readConfigFile(configPath, (file) => this.readFile(file));
    const parsed = ts.parseJsonConfigFileContent(
      loaded.config ?? {},
      host,
      dirname(configPath),
      {},
      configPath
    );
    if (loaded.error) parsed.errors.push(loaded.error);
    // An empty project is a useful query result, not a compiler build error.
    const errors = parsed.errors.filter((error) => error.code !== 18002 && error.code !== 18003);
    if (errors.length) {
      throw new Error(
        `Invalid configuration ${configPath}: ${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('; ')}`
      );
    }
    for (const file of parsed.fileNames) this.resolve(file);
    return parsed;
  }

  getCompilerOptions(): ts.CompilerOptions {
    return this.configuration(this.scan())?.options ?? {};
  }

  async discover(input = '.'): Promise<string[]> {
    const canonical = this.resolve(input);
    const info = statSync(canonical);
    if (!info.isDirectory() && !info.isFile())
      throw new Error(`Path is neither a file nor directory: ${input}`);
    const files = this.scan();
    const config = this.configuration(files);
    const selected = config
      ? new Set(config.fileNames.map((file) => pathKey(resolve(file))))
      : undefined;
    return files.filter(
      (file) =>
        (!selected || selected.has(pathKey(file))) &&
        (info.isFile()
          ? pathKey(file) === pathKey(canonical)
          : contains(pathKey(canonical), pathKey(file)))
    );
  }
}
