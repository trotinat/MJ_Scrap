import {describe,it,expect} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '../src/middleware';
describe('reverse-proxy authentication redirects',()=>{
 it('keeps login on the public origin even when Next sees a localhost backend',()=>{
  const r=middleware(new NextRequest('https://localhost:3000/criteres?q=x',{headers:{host:'deals.taile7bea0.ts.net','x-forwarded-proto':'https','x-forwarded-for':'100.71.32.2'}}));
  expect(r.status).toBe(307);expect(r.headers.get('location')).toBe('https://deals.taile7bea0.ts.net/login');
 });
 it('returns unauthorized JSON for private APIs and permits the login page',()=>{
  expect(middleware(new NextRequest('http://localhost:3000/api/run-status',{headers:{'x-forwarded-for':'100.71.32.2'}})).status).toBe(401);
  expect(middleware(new NextRequest('http://localhost:3000/login')).status).toBe(200);
 });
});
