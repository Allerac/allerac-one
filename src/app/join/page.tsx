import { validateInviteToken } from '@/app/actions/invites';
import JoinClient from './JoinClient';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function JoinPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <JoinClient
        token=""
        email=""
        domainSlug=""
        error="No invite token provided. Please use the link from your invitation email."
      />
    );
  }

  const result = await validateInviteToken(token);

  if (!result.valid) {
    return <JoinClient token={token} email="" domainSlug="" error={result.error} />;
  }

  return (
    <JoinClient
      token={token}
      email={result.email}
      domainSlug={result.domainSlug}
      error={null}
    />
  );
}
