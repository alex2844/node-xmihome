#!/usr/bin/env bun

import path from 'path';
import { rm, mkdir, readdir, stat } from 'fs/promises';

console.time('✨ Build complete');

const SRC_DIR = path.resolve(import.meta.dir, 'src');
const DIST_DIR = path.resolve(import.meta.dir, 'dist');
const DOCS_DIR = path.resolve(import.meta.dir, 'docs');
const LOCALES_DIR = path.resolve(import.meta.dir, 'locales');

const packageJsonPath = path.resolve(import.meta.dir, 'package.json');
const packageJson = await Bun.file(packageJsonPath).json();

const nodePrefix = packageJson.name?.split('-').pop();
if (!nodePrefix)
	throw new Error(`Could not determine node prefix from package name: ${packageJson.name}`);
console.log(`📦 Using node prefix: "${nodePrefix}"`);

async function dirExists(dirPath) {
	try {
		const stats = await stat(dirPath);
		return stats.isDirectory();
	} catch (error) {
		if (error.code === 'ENOENT')
			return false;
		throw error;
	}
};

async function main() {
	await rm(DIST_DIR, { recursive: true, force: true });
	console.log(`🧹 Cleaned ${DIST_DIR} directory.`);

	const distNodesDir = path.join(DIST_DIR, 'nodes');
	await mkdir(distNodesDir, { recursive: true });

	const nodesSrcDir = path.join(SRC_DIR, 'nodes');
	if (!(await dirExists(nodesSrcDir))) {
		console.warn(`⚠️  Source directory for nodes not found at ${nodesSrcDir}. Nothing to build.`);
		return;
	}

	const nodeDirEntries = await readdir(nodesSrcDir, { withFileTypes: true });
	const nodeNames = nodeDirEntries
		.filter(dirent => dirent.isDirectory())
		.map(dirent => dirent.name);

	if (nodeNames.length === 0) {
		console.log('🤷 No nodes found to build.');
		return;
	}

	console.log(`🔍 Found ${nodeNames.length} nodes: ${nodeNames.join(', ')}`);

	await Promise.all(nodeNames.map(buildNode));
	await copyAllDocs(nodeNames);
	await copyAllLocales(nodeNames);
};

// --- Функция сборки одного узла ---
async function buildNode(nodeName) {
	const nodeSrcDir = path.join(SRC_DIR, 'nodes', nodeName);
	const nodeDistDir = path.join(DIST_DIR, 'nodes');

	// Сборка JS (runtime)
	const runtimeSrc = path.join(nodeSrcDir, 'runtime.js');
	if (await Bun.file(runtimeSrc).exists()) {
		const external = Object.keys(packageJson.dependencies || {});
		const buildResult = await Bun.build({
			// packages?: "bundle" | "external"; // TODO
			external,
			entrypoints: [runtimeSrc],
			outdir: nodeDistDir,
			naming: `${nodeName}.js`,
			target: 'node',
			minify: true
		});
		if (buildResult.success)
			console.log(`✅ Built ${nodeName}.js`);
		else
			console.error(`❌ Build failed for ${nodeName}.js:`, buildResult.logs);
	}

	// Сборка HTML
	const finalHtmlParts = [];

	// UI Script
	const uiSrc = path.join(nodeSrcDir, 'ui.js');
	if (await Bun.file(uiSrc).exists()) {
		const buildResult = await Bun.build({
			entrypoints: [uiSrc],
			target: 'browser',
			minify: true
		});
		if (buildResult.success) {
			const [artifact] = buildResult.outputs;
			const content = await artifact.text();
			finalHtmlParts.push(`<script type="text/javascript">\n${content}</script>`);
		} else
			console.error(`❌ Build failed for ${nodeName}/ui.js:`, buildResult.logs);
	}

	// HTML Template
	const templateSrc = path.join(nodeSrcDir, 'template.html');
	if (await Bun.file(templateSrc).exists()) {
		const content = await Bun.file(templateSrc).text();
		finalHtmlParts.push(`<script type="text/html" data-template-name="${nodePrefix}-${nodeName}">\n${content}</script>`);
	}

	if (finalHtmlParts.length > 0) {
		const htmlDest = path.join(nodeDistDir, `${nodeName}.html`);
		await Bun.write(htmlDest, finalHtmlParts.join('\n\n'));
		console.log(`📦 Assembled ${nodeName}.html`);
	}

	// Иконки
	const iconSrcDir = path.join(nodeSrcDir, 'icons');
	if (await dirExists(iconSrcDir)) {
		const iconDistDir = path.join(nodeDistDir, 'icons');
		await mkdir(iconDistDir, { recursive: true });

		const glob = new Bun.Glob(path.join(iconSrcDir, '*'));
		for await (const file of glob.scan()) {
			const dest = path.join(iconDistDir, path.basename(file));
			await Bun.write(dest, Bun.file(file));
		}
		console.log(`🎨 Copied icons for ${nodeName}`);
	}
};

// --- Функция копирования всех Документаций ---
async function copyAllDocs(nodeNames) {
	if (!(await dirExists(DOCS_DIR)))
		return;
	let copied = false;
	const langDirEntries = await readdir(DOCS_DIR, { withFileTypes: true });
	for (const dirent of langDirEntries) {
		if (!dirent.isDirectory())
			continue;
		const lang = dirent.name;
		const localeDistDir = path.join(DIST_DIR, 'nodes', 'locales', lang);
		for (const nodeName of nodeNames) {
			const docSrc = path.join(DOCS_DIR, lang, `${nodeName}.md`);
			if (await Bun.file(docSrc).exists()) {
				await mkdir(localeDistDir, { recursive: true });
				const dest = path.join(localeDistDir, `${nodeName}.html`);
				const content = await Bun.file(docSrc).text();
				await Bun.write(dest, `<script type="text/markdown" data-help-name="${nodePrefix}-${nodeName}" data-lang="${lang}">\n${content}</script>`);
				copied = true;
			}
		}
	}
	if (copied)
		console.log('🌍 Copied docs files.');
};

// --- Функция копирования всех локалей ---
async function copyAllLocales(nodeNames) {
	if (!(await dirExists(LOCALES_DIR)))
		return;
	let copied = false;
	const langDirEntries = await readdir(LOCALES_DIR, { withFileTypes: true });
	for (const dirent of langDirEntries) {
		if (!dirent.isDirectory())
			continue;
		const lang = dirent.name;
		const langPath = path.join(LOCALES_DIR, lang);
		const localeDistDir = path.join(DIST_DIR, 'nodes', 'locales', lang);
		for (const nodeName of nodeNames) {
			const localeSrc = path.join(langPath, `${nodeName}.json`);
			if (await Bun.file(localeSrc).exists()) {
				await mkdir(localeDistDir, { recursive: true });
				const dest = path.join(localeDistDir, `${nodeName}.json`);
				await Bun.write(dest, Bun.file(localeSrc));
				copied = true;
			}
		}
	}
	if (copied)
		console.log('🌍 Copied locale files.');
};

main().catch(err => {
	console.error('Build failed:', err);
	process.exit(1);
}).then(() => {
	console.timeEnd('✨ Build complete');
});
