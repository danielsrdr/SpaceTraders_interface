import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = 'https://api.spacetraders.io/v2';

interface OpenApiParam {
  name: string;
  in: string;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParam[];
  security?: Record<string, unknown>[];
}

interface EndpointRecord {
  method: string;
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description: string;
  pathParams: string[];
  queryParams: string[];
  requiresAuth: boolean;
}

function loadSpec(): { paths: Record<string, Record<string, OpenApiOperation>> } {
  const specPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'SpaceTraders.json');
  return JSON.parse(readFileSync(specPath, 'utf8'));
}

function buildEndpoints(spec: ReturnType<typeof loadSpec>): EndpointRecord[] {
  const endpoints: EndpointRecord[] = [];
  const paths = spec.paths ?? {};

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (method === 'parameters' || !op) continue;

      const pathParams: string[] = [];
      const queryParams: string[] = [];
      const shared = (methods as { parameters?: OpenApiParam[] }).parameters ?? [];
      const own = op.parameters ?? [];

      for (const param of [...shared, ...own]) {
        if (param.in === 'path') pathParams.push(param.name);
        if (param.in === 'query') queryParams.push(param.name);
      }

      const requiresAuth = path.includes('/my/') || path === '/register';

      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId: op.operationId ?? `${method}-${path}`,
        tag: op.tags?.[0] ?? 'Other',
        summary: op.summary ?? op.operationId ?? path,
        description: (op.description ?? '').replace(/\s+/g, ' ').trim(),
        pathParams,
        queryParams,
        requiresAuth,
      });
    }
  }

  return endpoints;
}

function resolvePath(template: string, pathParams: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(pathParams[key] ?? ''));
}

const spec = loadSpec();
const endpoints = buildEndpoints(spec);
const tags = [...new Set(endpoints.map((e) => e.tag))];

const server = new McpServer({
  name: 'spacetraders-api',
  version: '1.0.0',
});

server.tool(
  'list_endpoint_categories',
  'List all SpaceTraders API endpoint categories (tags) from the OpenAPI spec.',
  {},
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            source: 'https://spacetraders.io/openapi',
            apiBase: API_BASE,
            categories: tags.map((tag) => ({
              tag,
              count: endpoints.filter((e) => e.tag === tag).length,
              description: spec.paths ? undefined : undefined,
            })),
            totalEndpoints: endpoints.length,
          },
          null,
          2,
        ),
      },
    ],
  }),
);

server.tool(
  'list_endpoints',
  'List SpaceTraders API endpoints, optionally filtered by category tag (Global, Systems, Factions, Agents, Contracts, Fleet, Data).',
  {
    tag: z.string().optional().describe('Filter by category tag, e.g. Fleet or Systems'),
  },
  async ({ tag }: { tag?: string }) => {
    const filtered = tag ? endpoints.filter((e) => e.tag === tag) : endpoints;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              tag: tag ?? 'all',
              count: filtered.length,
              endpoints: filtered,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'get_endpoint',
  'Get full details for a single SpaceTraders API endpoint by operationId or method+path.',
  {
    operationId: z.string().optional().describe('OpenAPI operationId, e.g. navigate-ship'),
    method: z.string().optional().describe('HTTP method when using path lookup'),
    path: z
      .string()
      .optional()
      .describe('OpenAPI path template, e.g. /my/ships/{shipSymbol}/navigate'),
  },
  async ({
    operationId,
    method,
    path: pathTemplate,
  }: {
    operationId?: string;
    method?: string;
    path?: string;
  }) => {
    let match: EndpointRecord | undefined;

    if (operationId) {
      match = endpoints.find((e) => e.operationId === operationId);
    } else if (method && pathTemplate) {
      match = endpoints.find(
        (e) => e.method === method.toUpperCase() && e.path === pathTemplate,
      );
    }

    if (!match) {
      return {
        content: [{ type: 'text', text: 'Endpoint not found. Use list_endpoints to browse.' }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(match, null, 2) }],
    };
  },
);

server.tool(
  'call_spacetraders_api',
  'Call any SpaceTraders API endpoint. Uses SPACETRADERS_TOKEN env var for auth when required.',
  {
    method: z.string().describe('HTTP method: GET, POST, PATCH, PUT, DELETE'),
    path: z
      .string()
      .describe('Path template or resolved path, e.g. /my/agent or /systems/{systemSymbol}'),
    pathParams: z
      .record(z.string(), z.string())
      .optional()
      .describe('Values for {pathParam} placeholders'),
    query: z.record(z.string(), z.string()).optional().describe('Query string parameters'),
    body: z.unknown().optional().describe('JSON request body for POST/PATCH/PUT'),
    token: z
      .string()
      .optional()
      .describe('Bearer token override; defaults to SPACETRADERS_TOKEN env'),
  },
  async ({
    method,
    path: pathInput,
    pathParams,
    query,
    body,
    token,
  }: {
    method: string;
    path: string;
    pathParams?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
    token?: string;
  }) => {
    const resolvedPath = pathParams ? resolvePath(pathInput, pathParams) : pathInput;
    const url = new URL(`${API_BASE}${resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    const authToken = token ?? process.env.SPACETRADERS_TOKEN;
    const headers: Record<string, string> = { Accept: 'application/json' };

    const upperMethod = method.toUpperCase();
    const needsBody = ['POST', 'PATCH', 'PUT'].includes(upperMethod);

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    if (needsBody) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method: upperMethod,
      headers,
      body: needsBody ? JSON.stringify(body ?? {}) : undefined,
    });

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: response.status,
              ok: response.ok,
              url: url.toString(),
              data: parsed,
            },
            null,
            2,
          ),
        },
      ],
      isError: !response.ok,
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
