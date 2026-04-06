import { NextRequest, NextResponse } from 'next/server';

type ProxyBodyMode = 'none' | 'json' | 'form-data';

interface ProxyRequestOptions {
  request: NextRequest;
  backendPath: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  bodyMode?: ProxyBodyMode;
  includeQuery?: boolean;
}

function getBackendBaseUrl(): string {
  const configuredBase = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return configuredBase.replace(/\/+$/, '');
}

function buildBackendUrl(backendPath: string, request: NextRequest, includeQuery: boolean): string {
  const normalizedPath = backendPath.startsWith('/') ? backendPath : `/${backendPath}`;
  const base = getBackendBaseUrl();
  const query = includeQuery ? request.nextUrl.search : '';
  return `${base}${normalizedPath}${query}`;
}

async function getForwardBody(request: NextRequest, bodyMode: ProxyBodyMode): Promise<BodyInit | undefined> {
  if (bodyMode === 'json') {
    return request.text();
  }

  if (bodyMode === 'form-data') {
    return request.formData();
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
  const targetUrl = buildBackendUrl(backendPath, request, includeQuery);
  const requestMethod = method || (request.method as ProxyRequestOptions['method']) || 'GET';
  const headers = new Headers();
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    headers.set('authorization', authHeader);
  }

  if (bodyMode === 'json') {
    headers.set('content-type', 'application/json');
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: requestMethod,
      headers,
      body: await getForwardBody(request, bodyMode),
      cache: 'no-store',
    });

    return relayResponse(upstream);
  } catch {
    return NextResponse.json(
      { error: 'Backend service is unavailable. Check NEXT_PUBLIC_API_URL/API_URL and backend runtime.' },
      { status: 502 },
    );
  }
}
