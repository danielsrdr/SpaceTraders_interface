import { ApiRequestRecord } from './api-explorer.store';

function buildUrl(path: string, host = 'https://api.spacetraders.io/v2'): string {
  return `${host}${path}`;
}

function resolvePath(template: string, pathParams: Record<string, string>): string {
  let path = template;
  for (const [key, value] of Object.entries(pathParams)) {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  }
  return path;
}

function buildQueryString(query: Record<string, string>): string {
  const qs = Object.entries(query)
    .filter(([, v]) => v.trim() !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

export function buildCurl(record: ApiRequestRecord, token?: string | null): string {
  const path = resolvePath(record.path, record.pathParams) + buildQueryString(record.query);
  const url = buildUrl(path);
  const lines = [`curl -X ${record.method} '${url}'`, `-H 'Accept: application/json'`];
  if (token) {
    lines.push(`-H 'Authorization: Bearer ${token}'`);
  }
  if (['POST', 'PATCH', 'PUT'].includes(record.method) && record.body !== undefined) {
    lines.push(`-H 'Content-Type: application/json'`);
    lines.push(`-d '${JSON.stringify(record.body)}'`);
  }
  return lines.join(' \\\n  ');
}

export function buildFetch(record: ApiRequestRecord, token?: string | null): string {
  const path = resolvePath(record.path, record.pathParams) + buildQueryString(record.query);
  const url = buildUrl(path);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const needsBody = ['POST', 'PATCH', 'PUT'].includes(record.method);
  if (needsBody) headers['Content-Type'] = 'application/json';

  const parts = [
    `const response = await fetch('${url}', {`,
    `  method: '${record.method}',`,
    `  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`,
  ];
  if (needsBody) {
    parts.push(`  body: JSON.stringify(${JSON.stringify(record.body ?? {}, null, 2)}),`);
  }
  parts.push('});', 'const data = await response.json();');
  return parts.join('\n');
}

export function buildAngularCall(record: ApiRequestRecord): string {
  const pathParams = JSON.stringify(record.pathParams, null, 2);
  const query = JSON.stringify(record.query, null, 2);
  const body =
    record.body !== undefined ? `,\n  body: ${JSON.stringify(record.body, null, 2)}` : '';
  return `await this.api.callEndpoint(endpoint, {
  pathParams: ${pathParams},
  query: ${query}${body}
});`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
