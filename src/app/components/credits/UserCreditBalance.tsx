'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getMyCreditBalance } from '@/app/actions/credits';
import type { CreditBalance } from '@/app/services/credits/credit.service';

interface Props {
  isDarkMode: boolean;
  className?: string;
}

export default function UserCreditBalance({ isDarkMode, className = '' }: Props) {
  const locale = useLocale();
  const t = useTranslations('userSettings');
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getMyCreditBalance()
      .then(result => {
        if (active) setBalance(result);
      })
      .catch(error => {
        console.error('[UserCreditBalance] balance load error:', error);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  let value = t('loadingCredits');
  if (failed) {
    value = t('creditsUnavailable');
  } else if (balance?.unlimited) {
    value = t('unlimitedCredits');
  } else if (balance) {
    value = t('availableCredits', {
      credits: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
        .format(balance.availableCredits),
    });
  }

  return (
    <div className={`px-3 py-2 ${className}`}>
      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        {t('credits')}
      </p>
      <p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
