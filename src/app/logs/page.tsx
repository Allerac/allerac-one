import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import { MODELS } from '@/app/services/llm/models';
import LogsClient from './LogsClient';

const authService = new AuthService();

export default async function LogsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) redirect('/login');
  const user = await authService.validateSession(token);
  if (!user) redirect('/login');

  return (
    <LogsClient
      userId={String(user.id)}
      MODELS={MODELS}
      defaultModel={MODELS[0]?.id ?? 'qwen2.5:3b'}
    />
  );
}
