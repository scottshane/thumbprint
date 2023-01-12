const withMDX = require('@next/mdx')({
    extension: /\.mdx?$/,
    options: {
        remarkPlugins: [],
        rehypePlugins: [],
        providerImportSource: '@mdx-js/react',
    },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ['@thumbtack/thumbprint-react'],
    pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
    eslint: {
        // We do this separately in CI.
        ignoreDuringBuilds: true,
    },
    webpack: config => {
        // This allows Thumbprint React to work. It's needed for a bug in `next-transpile-modules`
        // was was ported over to Next.js and still exists as a bug in `transpilePackages`.
        // https://github.com/martpie/next-transpile-modules/issues/117
        //
        // The param is reassigned since this is Next.js convention in their docs.
        // eslint-disable-next-line no-param-reassign
        config.resolve.alias['@thumbtack/thumbprint-react'] =
            '@thumbtack/thumbprint-react/dist/es/index.js';

        return config;
    },
};

module.exports = withMDX(nextConfig);