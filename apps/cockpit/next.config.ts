import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  devIndicators: false,
  // OAuth codes and state belong to the verifier, never development access logs.
  logging: { incomingRequests: { ignore: [/\/api\/shopify\/oauth\/callback/] } },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
