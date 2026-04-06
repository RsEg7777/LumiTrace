import { NextRequest } from 'next/server';

import { proxyRequest } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyRequest({
    request,
    backendPath: '/auth/register',
    method: 'POST',
    bodyMode: 'json',
  });
}
