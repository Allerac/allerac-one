/** @jest-environment node */

import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('proxy', () => {
  it('restores an encoded query string in an API pathname', () => {
    const request = new NextRequest(
      'http://localhost/api/instagram/callback%3Fcode%3Dabc%26state%3Dxyz'
    );

    const response = proxy(request);
    const rewritten = response.headers.get('x-middleware-rewrite');

    expect(rewritten).toBe(
      'http://localhost/api/instagram/callback?code=abc&state=xyz'
    );
  });

  it('accepts lowercase encoded separators', () => {
    const request = new NextRequest(
      'http://localhost/api/search%3fq%3dsecurity%26page%3d2'
    );

    const response = proxy(request);

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/api/search?q=security&page=2'
    );
  });

  it('passes through a normal API URL', () => {
    const request = new NextRequest('http://localhost/api/search?q=security');

    const response = proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
