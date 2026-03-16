// oidc-provider ships its own types but requires moduleResolution: bundler/node16.
// This declaration lets TypeScript accept the dynamic import without errors.
// The provider instance is typed as `any` in provider.ts intentionally.
declare module 'oidc-provider';
