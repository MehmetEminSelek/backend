/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    webpack: (config, { isServer }) => {
        // Fix for node: protocol imports
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                crypto: require.resolve('crypto-browserify'),
                stream: require.resolve('stream-browserify'),
                buffer: require.resolve('buffer'),
            };
        }

        // Handle node: protocol
        config.resolve.alias = {
            ...config.resolve.alias,
            'node:crypto': 'crypto',
            'node:buffer': 'buffer',
            'node:stream': 'stream',
        };

        return config;
    },
    // Disable SWC minifier in development to avoid issues
    swcMinify: process.env.NODE_ENV === 'production',
}

module.exports = nextConfig 