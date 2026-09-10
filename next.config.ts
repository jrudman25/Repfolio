import type { NextConfig } from "next";
import { originEnv } from './src/lib/env-validation';

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  async headers() {
    const development = process.env.NODE_ENV === 'development';
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? originEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL, development)
      : '';
    const connections = supabase ? `${supabase} ${supabase.replace(/^http/, 'ws')}` : '';
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatars.githubusercontent.com https://github.com",
      "font-src 'self' data:",
      `connect-src 'self' ${connections}${development ? ' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*' : ''}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join('; ');
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  }
};

export default nextConfig;
