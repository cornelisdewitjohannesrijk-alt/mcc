/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mcc/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.fbsbx.com' },
      { protocol: 'https', hostname: 'graph.facebook.com' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'http', hostname: 'localhost', port: '4000' },
    ],
  },
}

export default nextConfig
