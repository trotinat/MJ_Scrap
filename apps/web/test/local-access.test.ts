import {describe,it,expect} from 'vitest';
import {isDirectLocalRequest} from '../src/lib/local-access';
describe('private remote access',()=>{
 it('permits the development bypass only for direct loopback hosts',()=>{for(const host of ['localhost:3000','127.0.0.1:3000','[::1]:3000'])expect(isDirectLocalRequest(new Headers({host}))).toBe(true);for(const host of ['pc.example.ts.net','192.168.1.2:3000','localhost.example.com'])expect(isDirectLocalRequest(new Headers({host}))).toBe(false);});
 it('requires login even when a proxy rewrites Host to localhost',()=>{for(const key of ['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip','tailscale-user-login','tailscale-user-name']) expect(isDirectLocalRequest(new Headers({host:'localhost:3000',[key]:'test'}))).toBe(false);});
});
