'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export default function UnitConnectionsLinks({ collapsed = false, className }: { collapsed?: boolean; className: string }) {
  const t = useTranslations('terminal.nav');
  const [terminal, setTerminal] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(['claude', 'codex'].map(provider => fetch(`/api/terminal/access?provider=${provider}`, { signal: controller.signal }))).then(responses => { if (responses.some(response => response.ok)) setTerminal(true); }).catch(() => {});
    return () => controller.abort();
  }, []);
  return <>
    <Link href="/connections" className={className} title={t('connections')}><span aria-hidden="true">↗</span>{!collapsed && <span>{t('connections')}</span>}</Link>
    {terminal && <Link href="/terminal" className={className} title={t('unitTerminal')}><span aria-hidden="true">&gt;_</span>{!collapsed && <span>{t('terminal')}</span>}</Link>}
  </>;
}
