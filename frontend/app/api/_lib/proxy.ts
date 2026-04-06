import { NextRequest, NextResponse } from 'next/server';

type ProxyBodyMode = 'none' | 'json' | 'form-data';

interface ProxyRequestOptions {
  request: NextRequest;
  backendPath: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  bodyMode?: ProxyBodyMode;
  includeQuery?: boolean;
}

function getConfiguredBackendBase(): string {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function getBackendBaseUrls(configuredBase: string): string[] {
  const normalizedBase = normalizeBaseUrl(configuredBase);
  const candidates = [normalizedBase];

  try {
    const parsed = new URL(normalizedBase);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      candidates.push(normalizeBaseUrl(parsed.toString()));
    } else if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
      candidates.push(normalizeBaseUrl(parsed.toString()));
    }
  } catch {
    // If URL parsing fails, keep the configured value as-is.
  }

  return Array.from(new Set(candidates));
}

function isLocalhostBackend(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isLikelyVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

function buildBackendUrl(
  baseUrl: string,
  backendPath: string,
  request: NextRequest,
  includeQuery: boolean,
): string {
  const normalizedPath = backendPath.startsWith('/') ? backendPath : `/${backendPath}`;
  const query = includeQuery ? request.nextUrl.search : '';
  return `${baseUrl}${normalizedPath}${query}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getForwardBody(request: NextRequest, bodyMode: ProxyBodyMode): Promise<BodyInit | undefined> {
  if (bodyMode === 'json') {
    return request.text();
  }

  if (bodyMode === 'form-data') {
    return request.arrayBuffer();
  }

  return undefined;
}

function relayResponse(upstream: Response): NextResponse {
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  const contentDisposition = upstream.headers.get('content-disposition');
  const cacheControl = upstream.headers.get('cache-control');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  if (contentDisposition) {
    headers.set('content-disposition', contentDisposition);
  }

  if (cacheControl) {
    headers.set('cache-control', cacheControl);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function proxyRequest({
  request,
  backendPath,
  method,
  bodyMode = 'none',
  includeQuery = true,
}: ProxyRequestOptions): Promise<NextResponse> {
  const configuredBase = getConfiguredBackendBase();
  const baseUrls = getBackendBaseUrls(configuredBase);
  const requestMethod = method || (request.method as ProxyRequestOptions['method']) || 'GET';
  const requestBody = await getForwardBody(request, bodyMode);
  const networkErrors: string[] = [];
  const headers = new Headers();
  const authHeader = request.headers.get('authorization');

  if (isLikelyVercelRuntime() && baseUrls.every(isLocalhostBackend)) {
    return NextResponse.json(
      {
        error: 'Backend service is unavailable. API_URL is configured to localhost in Vercel runtime.',
        hint: 'Set API_URL (and optionally NEXT_PUBLIC_API_URL) in Vercel to a public backend URL such as https://api.example.com, then redeploy.',
      },
      { status: 502 },
    );
  }

  if (authHeader) {
    headers.set('authorization', authHeader);
  }

  if (bodyMode === 'json') {
    headers.set('content-type', 'application/json');
  }

  if (bodyMode === 'form-data') {
    const contentType = request.headers.get('content-type');
    if (contentType) {
      headers.set('content-type', contentType);
    }
  }

  for (const baseUrl of baseUrls) {
    const targetUrl = buildBackendUrl(baseUrl, backendPath, request, includeQuery);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const upstream = await fetch(targetUrl, {
          method: requestMethod,
          headers,
          body: requestBody,
          cache: 'no-store',
        });

        return relayResponse(upstream);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown network error';
        networkErrors.push(`${targetUrl} -> ${detail}`);
        if (attempt === 0) {
          await sleep(120);
        }
      }
    }
  }

  return NextResponse.json(
    {
      error: 'Backend service is unavailable. Check NEXT_PUBLIC_API_URL/API_URL and backend runtime.',
      configured_base: process.env.NODE_ENV === 'production' ? undefined : configuredBase,
      details: process.env.NODE_ENV === 'production' ? undefined : networkErrors,
    },
    { status: 502 },
  );
}
