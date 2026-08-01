import type { ApiConsoleEndpoint } from '@/app/components/settings/ApiConsole';

export interface EmbeddedToken {
  value: string;
  expiresAt: string;
}

// Builds a copyable, agent-facing "how to use this Bridge" doc. Matches the
// "portable agent skill" described in docs/architecture/allerac-bridge.md.
//
// With `token`: embeds a real, already-active short-lived token directly —
// this is the one-paste flow (BridgeClient mints a fresh quick token right
// before copying), safe specifically because that token expires on its own
// in a few hours. Without `token`: falls back to documenting the auth header
// with a placeholder, for copying into a permanent tool/agent integration
// where the real key lives in an env var instead.
export function buildAgentPrompt(endpoints: ApiConsoleEndpoint[], baseUrl: string, token?: EmbeddedToken): string {
  const lines: string[] = [];
  const authValue = token ? token.value : '<ALLERAC_API_KEY>';
  const curlAuthValue = token ? token.value : '$ALLERAC_API_KEY';

  lines.push('# Allerac Bridge — API access');
  lines.push('');
  lines.push(
    'You have access to read data live from a service connected through Allerac Bridge. ' +
    'Every response below is fetched live from the provider — Allerac never stores it.',
  );
  lines.push('');
  lines.push('## Authentication');
  lines.push('');

  if (token) {
    lines.push(`This token is already active and expires ${new Date(token.expiresAt).toLocaleString()}. Use it as a Bearer token on every request:`);
  } else {
    lines.push('Send the key as a Bearer token on every request:');
  }

  lines.push('');
  lines.push('```');
  lines.push(`Authorization: Bearer ${authValue}`);
  lines.push('```');
  lines.push('');

  if (token) {
    lines.push('It stops working on its own once it expires — fine to keep in this conversation until then.');
  } else {
    lines.push(
      'Read `<ALLERAC_API_KEY>` from an environment variable or your secret store — ' +
      'never hardcode it or repeat it back in plain text.',
    );
  }

  lines.push('');
  lines.push(`Base URL: \`${baseUrl}\``);
  lines.push('');
  lines.push('## Endpoints');

  for (const endpoint of endpoints) {
    lines.push('');
    lines.push(`### ${endpoint.method} ${endpoint.path}`);
    lines.push(endpoint.label);

    if (endpoint.params && endpoint.params.length > 0) {
      lines.push('');
      lines.push('Query parameters:');
      for (const param of endpoint.params) {
        const requirement = param.required ? 'required' : 'optional';
        const example = param.placeholder ? ` — e.g. \`${param.placeholder}\`` : '';
        lines.push(`- \`${param.name}\` (${requirement})${example}`);
      }
    }

    const exampleQuery = (endpoint.params ?? [])
      .filter(param => param.required)
      .map(param => `${param.name}=${param.placeholder ?? 'value'}`)
      .join('&');

    lines.push('');
    lines.push('```bash');
    lines.push(`curl -H "Authorization: Bearer ${curlAuthValue}" \\`);
    lines.push(`  "${baseUrl}${endpoint.path}${exampleQuery ? `?${exampleQuery}` : ''}"`);
    lines.push('```');
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('- Every response uses `Cache-Control: no-store` — nothing here is ever cached.');
  lines.push(
    '- A `409 garmin_not_connected` response means the user hasn\'t connected this ' +
    'service in Allerac yet — ask them to do that before retrying.',
  );
  lines.push('- A `401` means the token is missing, invalid, or has expired/been revoked.');

  return lines.join('\n');
}
