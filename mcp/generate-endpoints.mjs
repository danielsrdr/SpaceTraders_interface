import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = join(root, 'mcp', 'SpaceTraders.json');
const outPath = join(root, 'src', 'app', 'models', 'api-endpoints.data.ts');

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const paths = spec.paths ?? {};

/** @type {Array<{ method: string; path: string; operationId: string; tag: string; summary: string; description: string; pathParams: string[]; queryParams: string[]; requiresAuth: boolean }>} */
const endpoints = [];

for (const [path, methods] of Object.entries(paths)) {
  for (const [method, op] of Object.entries(methods)) {
    if (method === 'parameters' || !op || typeof op !== 'object') continue;

    const pathParams = [];
    const queryParams = [];
    const allParams = [...(methods.parameters ?? []), ...(op.parameters ?? [])];

    for (const param of allParams) {
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

const tags = [...new Set(endpoints.map((e) => e.tag))];

const content = `/** Generated from SpaceTraders OpenAPI — run: node mcp/generate-endpoints.mjs */
export interface ApiEndpointMeta {
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

export const API_ENDPOINT_TAGS: string[] = ${JSON.stringify(tags, null, 2)};

export const API_ENDPOINTS: ApiEndpointMeta[] = ${JSON.stringify(endpoints, null, 2)};
`;

writeFileSync(outPath, content, 'utf8');
console.log(`Wrote ${endpoints.length} endpoints across ${tags.length} tags to ${outPath}`);
