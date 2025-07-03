#!/usr/bin/env bun

import path from 'path';
import { rm } from 'fs/promises';
/** @import { BuildConfig, BunPlugin } from 'bun' */

const SRC_DIR = path.resolve(import.meta.dir, 'src');
const DIST_DIR = path.resolve(import.meta.dir, 'dist');

/**
 * Плагин Bun для "подмены" импортов во время сборки для браузера.
 * Это позволяет использовать один и тот же код устройств (из `xmihome-devices`),
 * который импортирует 'xmihome/device.js', подменяя его на лету на браузерную версию.
 * @type {BunPlugin}
 */
const aliasPlugin = {
	name: 'alias-plugin',
	setup(build) {
		const browserDevicePath = path.join(SRC_DIR, 'device.js');
		build.onResolve({ filter: /^xmihome\/device\.js$/ }, () => {
			return { path: browserDevicePath };
		});
		build.onResolve({ filter: /^crypto$/ }, (args) => ({
			path: args.path,
			namespace: 'crypto-stub',
		}));
		build.onLoad({ filter: /.*/, namespace: 'crypto-stub' }, () => ({
			contents: `
				export default {
					randomBytes: (size) => window.crypto.getRandomValues(new Uint8Array(size))
				};
			`,
			loader: 'js',
		}));
	}
};

/**
 * Плагин Bun для внедрения полифиллов, необходимых для работы некоторых npm-пакетов в браузере.
 * @type {BunPlugin}
 */
const polyfillPlugin = {
	name: 'polyfill-plugin',
	setup(build) {
		build.onLoad({ filter: /main\.js$/ }, async (args) => {
			const content = await Bun.file(args.path).text();
			const contents = [
				`import { Buffer } from 'buffer';`,
				'window.Buffer = Buffer;',
				'window.global = window;',
				content
			].join('\n');
			return { contents, loader: 'js' };
		});
	}
};

/**
 * Опции сборки, общие для dev и build режимов.
 * @type {BuildConfig}
 */
const buildOptions = {
	entrypoints: [path.join(SRC_DIR, 'main.js')],
	target: 'browser',
	plugins: [aliasPlugin, polyfillPlugin]
};

export async function server() {
	console.log('🚀 Starting development server with live reload...');
	Bun.serve({
		port: 3000,
		async fetch(req) {
			const url = new URL(req.url);
			const pathname = url.pathname;
			console.log(`[DevServer] ${req.method} ${pathname}`);
			if (pathname === '/dist/bundle.js') {
				const build = await Bun.build({
					...buildOptions,
					sourcemap: 'inline'
				});
				return new Response(build.outputs[0]);
			}
			if (url.pathname === '/')
				return new Response(Bun.file('./index.html'));
			if (url.pathname.startsWith('/public/'))
				return new Response(Bun.file(`.${url.pathname}`));
			return new Response('Not Found', { status: 404 });
		},
		error() {
			return new Response(null, { status: 404 });
		}
	});
	console.log('✅ Server listening on http://localhost:3000');
};

export default async function build() {
	console.time('✨ Build complete');

	await rm(DIST_DIR, { recursive: true, force: true });
	console.log(`🧹 Cleaned ${DIST_DIR} directory.`);

	const result = await Bun.build({
		...buildOptions,
		outdir: DIST_DIR,
		naming: 'bundle.js',
		minify: true
	});
	if (result.success)
		console.log(`✅ Web build successful! Output: ${DIST_DIR}/bundle.js`);
	else {
		console.error(`❌ Build failed:`, result.logs);
		process.exit(1);
	}
	console.timeEnd('✨ Build complete');
};

if (import.meta.path === Bun.main) {
	if (process.env.npm_lifecycle_event === 'dev')
		server();
	else
		build();
}
