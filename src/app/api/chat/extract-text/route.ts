import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request): Promise<Response> {
  try {
    await requireCurrentUser();
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = Buffer.from(await file.arrayBuffer());
      const data = await pdfParse(buffer);
      return Response.json({ text: data.text, pages: data.numpages });
    }

    // All other files: try to read as UTF-8 text
    const text = await file.text();
    return Response.json({ text });
  } catch (error) {
    console.error('[Extract Text API] Failed to parse file:', error);
    return Response.json({ error: 'Failed to extract text' }, { status: 422 });
  }
}
