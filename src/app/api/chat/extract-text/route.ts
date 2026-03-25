import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';

const authService = new AuthService();
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'File too large (max 10 MB)' }, { status: 413 });

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
}
