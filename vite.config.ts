import path from 'path';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import postcssConfig from './config/postcss.config.js';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// `npm run dev:live` uses the live database (wrangler.jsonc env.live).
			// DEV_STATE=<dir> keeps local data somewhere other than .wrangler/state,
			// for a throwaway copy (`wrangler d1 ... --local --persist-to <dir>`).
			adapter: adapter({
				platformProxy: {
					...(process.env.LIVE_DB ? { environment: 'live' } : {}),
					...(process.env.DEV_STATE ? { persist: { path: process.env.DEV_STATE } } : {})
				}
			}),
			// '*' turns off SvelteKit's cross-site form check so Twilio can post to
			// /api/sms. hooks.server.ts runs the same check for every other route.
			csrf: { trustedOrigins: ['*'] }
		})
	],
	resolve: {
		alias: {
			'@mixins': path.resolve(`./src/lib/styles/mixins/index.css`),
			'@styles': path.resolve(`./src/lib/styles`)
		}
	},
	css: {
		postcss: postcssConfig
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
