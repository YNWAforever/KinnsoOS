import { describe, it, expect } from 'vitest'
import { parseRedirectsPhp } from '../src/redirects'

describe('parseRedirectsPhp', () => {
  it('extracts redirectI18n from/to/status, ignores non-article noise', () => {
    const php = `<?php
Route::redirectI18n('/post/old-ramen', '/articles/dining/best-ramen-tokyo', 301);
Route::redirectI18n("/post/x", "/articles/destinations/y");
Route::get('/health', fn () => 'ok');
`
    const rows = parseRedirectsPhp(php)
    expect(rows).toEqual([
      { from_path: '/post/old-ramen', to_path: '/articles/dining/best-ramen-tokyo', status_code: 301 },
      { from_path: '/post/x', to_path: '/articles/destinations/y', status_code: 301 },
    ])
  })
})
