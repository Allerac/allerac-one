import { NextRequest } from 'next/server';
import { authenticationErrorResponse, requireCurrentUser } from '@/app/lib/auth-session';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';

const settings = new SystemSettingsService();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ number: string }> }
): Promise<Response> {
  try {
    await requireCurrentUser();

    const { number } = await params;
    const prNumber = parseInt(number, 10);
    if (!prNumber) return Response.json({ error: 'Invalid PR number' }, { status: 400 });

    const token = await settings.get('github_repo_token');
    if (!token) return Response.json({ error: 'github_repo_token not configured' }, { status: 503 });

    const res = await fetch(`https://api.github.com/repos/Allerac/allerac-one/pulls/${prNumber}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: `GitHub API ${res.status}: ${text}` }, { status: res.status });
    }

    const pr = await res.json();
    const status = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';

    return Response.json({
      pr_number: pr.number,
      status,
      title: pr.title,
      url: pr.html_url,
      merged_at: pr.merged_at,
      closed_at: pr.closed_at,
      created_at: pr.created_at,
      head_branch: pr.head?.ref,
    });
  } catch (e: any) {
    return authenticationErrorResponse(e);
  }
}
