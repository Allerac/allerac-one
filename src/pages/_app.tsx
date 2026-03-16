/**
 * Pages Router App wrapper.
 * Required to apply Tailwind global styles to Pages Router pages
 * (the OIDC interaction page uses the Pages Router).
 */

import '@/app/globals.css';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
