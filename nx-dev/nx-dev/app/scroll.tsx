'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function Scroll() {
  // when clicking a link, user will not scroll to the top of the page
  // their current scroll position will persist to the next page.
  // this useEffect is a workaround to 'fix' that behavior.
  // Discussion: https://github.com/vercel/next.js/discussions/64435

  const pathname = usePathname();

  useEffect(() => {
    window.scroll(0, 0);
  }, [pathname]);

  return <></>;
}
