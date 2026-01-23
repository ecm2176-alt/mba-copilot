import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Generate a client upload token for direct browser-to-blob uploads.
 * This bypasses the 4.5MB Vercel request body limit.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  // Capture the host from the request for use in onUploadCompleted
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const requestUrl = host ? `${protocol}://${host}` : null;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Validate and return metadata
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        return {
          allowedContentTypes: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/markdown',
            'text/csv',
          ],
          addRandomSuffix: true, // Prevent "blob already exists" errors
          tokenPayload: JSON.stringify({
            pathname,
            originalFilename: payload.originalFilename || pathname,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[Blob] Upload completed:', blob.url);

        // Process the file from blob storage
        try {
          const { originalFilename } = JSON.parse(tokenPayload || '{}');

          // Determine backend URL: use request URL if available, fallback to VERCEL_URL, then localhost
          const backendUrl = requestUrl ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

          console.log('[Blob] Processing file:', originalFilename);
          console.log('[Blob] Backend URL:', backendUrl);
          console.log('[Blob] Blob URL:', blob.url);
          console.log('[Blob] Request URL:', requestUrl);
          console.log('[Blob] VERCEL_URL env:', process.env.VERCEL_URL);

          // Build headers - include bypass token if available for deployment protection
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          // Add Vercel deployment protection bypass token if available
          if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
            headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
          }

          const fetchUrl = `${backendUrl}/backend/upload-from-url`;
          console.log('[Blob] Calling backend at:', fetchUrl);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 240000); // 4 minute timeout

          const response = await fetch(fetchUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              url: blob.url,
              filename: originalFilename || blob.pathname,
            }),
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId));

          console.log('[Blob] Backend response status:', response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[Blob] Backend processing failed:', response.status, errorText);
            console.error('[Blob] Request details:', { url: blob.url, filename: originalFilename || blob.pathname });
            throw new Error(`Backend processing failed: ${response.status} - ${errorText}`);
          }

          const result = await response.json();
          console.log('[Blob] Backend processing successful:', result);

          // Delete blob after processing
          const { del } = await import('@vercel/blob');
          await del(blob.url);
          console.log('[Blob] Deleted temporary blob:', blob.url);
        } catch (error) {
          console.error('[Blob] Error processing upload:', error);
          if (error instanceof Error) {
            console.error('[Blob] Error name:', error.name);
            console.error('[Blob] Error message:', error.message);
            console.error('[Blob] Error stack:', error.stack);
          }
          // Note: We can't notify the client directly from here since this is async
          // The error will appear in Vercel logs
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('[Blob] Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
