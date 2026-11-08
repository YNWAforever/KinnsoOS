'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {publicLanguage} from '../lib/seo/public-language';

/** Shared root layouts retain their initial request language on client navigation. */
export function DocumentLanguage() {
  const pathname = usePathname();
  useEffect(() => {
    const locale = publicLanguage(pathname?.split('/')[1]??'');
    if (locale) document.documentElement.lang = locale;
  }, [pathname]);
  return null;
}
