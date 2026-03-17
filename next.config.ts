import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  // oidc-provider is ESM-only and uses Node.js internals — do not bundle it.
  serverExternalPackages: ['oidc-provider'],
  // Next.js standalone file tracing misses .mjs files from ESM-only packages
  // that are transitive deps of oidc-provider. Include them explicitly so
  // they are copied into .next/standalone/node_modules.
  experimental: {
    outputFileTracingIncludes: {
      '/**': [
        './node_modules/oidc-provider/**',
        './node_modules/generator-function/**',
        './node_modules/jose/**',
        './node_modules/nanoid/**',
        './node_modules/oidc-token-hash/**',
        './node_modules/got/**',
        './node_modules/@sindresorhus/**',
        './node_modules/@szmarczak/**',
        './node_modules/cacheable-lookup/**',
        './node_modules/cacheable-request/**',
        './node_modules/decompress-response/**',
        './node_modules/form-data-encoder/**',
        './node_modules/get-stream/**',
        './node_modules/http2-wrapper/**',
        './node_modules/lowercase-keys/**',
        './node_modules/mimic-response/**',
        './node_modules/normalize-url/**',
        './node_modules/p-cancelable/**',
        './node_modules/quick-lru/**',
        './node_modules/responselike/**',
        './node_modules/eta/**',
      ],
    },
  },
};

export default withNextIntl(nextConfig);
