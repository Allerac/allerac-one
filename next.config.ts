import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  // oidc-provider is ESM-only and uses Node.js internals — do not bundle it.
  serverExternalPackages: ['oidc-provider'],
};

export default withNextIntl(nextConfig);
