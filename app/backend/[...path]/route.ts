import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max
export const dynamic = 'force-dynamic';
// Disable body size limit for this route
export const bodyParser = false;

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const path = params.path.join('/');
  const url = new URL(request.url);

  try {
    const response = await fetch(`${BACKEND_URL}/backend/${path}${url.search}`, {
      method: 'GET',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const path = params.path.join('/');

  try {
    // Forward the request body as-is (supports large files)
    const body = await request.arrayBuffer();

    console.log(`[Proxy] POST /backend/${path} - Body size: ${body.byteLength} bytes`);

    const response = await fetch(`${BACKEND_URL}/backend/${path}`, {
      method: 'POST',
      headers: {
        // Forward content type from original request
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
      body,
    });

    console.log(`[Proxy] Response status: ${response.status}`);

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Proxy] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      error: 'Proxy error',
      detail: errorMessage,
      path: `/backend/${path}`
    }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const path = params.path.join('/');

  try {
    const response = await fetch(`${BACKEND_URL}/backend/${path}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
