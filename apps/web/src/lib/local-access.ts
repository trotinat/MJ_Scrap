/** A reverse proxy must never inherit the local development login bypass. */
export function isDirectLocalRequest(headers: Pick<Headers,'get'|'has'>): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(headers.get('host')??'')
    && !['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip','tailscale-user-login','tailscale-user-name'].some(h=>headers.has(h));
}
