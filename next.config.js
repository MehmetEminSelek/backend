/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    experimental: {
        esmExternals: true
    },
    transpilePackages: ['@prisma/client']
};

export default nextConfig;