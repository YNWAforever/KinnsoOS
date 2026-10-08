'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';

/** Shared root layouts retain their initial request language on client navigation. */
export function DocumentLanguage() {
  const pathname = usePathname();
  useEffect(() => {
    const locale = pathname?.split('/')[1];
    if (locale === 'en' || locale === 'zh-HK') document.documentElement.lang = locale;
  }, [pathname]);
  return null;
}
