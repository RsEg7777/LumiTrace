import { NextRequest } from 'next/server';

import { proxyRequest } from '../../_lib/proxy';

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;

  return proxyRequest({
    request,
    backendPath: `/status/${jobId}`,
    method: 'GET',
  });
}
