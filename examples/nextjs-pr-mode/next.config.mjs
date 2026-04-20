/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/_pyanchor/:path*",
        destination: "http://127.0.0.1:3010/_pyanchor/:path*"
      }
    ];
  }
};

export default nextConfig;
