/** @type {import('next').NextConfig} */
export default {
    // The repo lints with its own flat config; Next's build-time lint would look for one here.
    eslint: { ignoreDuringBuilds: true },
    // The aparté packages are workspace links, not installed copies: compile them like the app's own.
    transpilePackages: ['@aparte/core', '@aparte/react', '@aparte/provider-scenario'],
};
