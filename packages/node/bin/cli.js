#!/usr/bin/env node

import { input, password, select } from '@inquirer/prompts';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import { homedir } from 'os';
import { mkdir, readFile, writeFile } from 'fs/promises';
import XiaomiMiHome from '../src/index.js';
import { COUNTRIES, CACHE_TTL } from '../src/constants.js';
/** @import { Credentials } from '../src/index.js' */
/** @import { DiscoveredDevice } from '../src/device.js' */
/** @import { ArgumentsCamelCase } from 'yargs' */

const CONFIG_DIR = path.join(homedir(), '.config', 'xmihome');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');
const DEVICE_CACHE_FILE = path.join(CONFIG_DIR, 'device_cache.json');
const CLOUD_DEVICE_LIST_FILE = path.join(CONFIG_DIR, 'cloud_device_list.json');
const CONNECTION_TYPES = /** @type {const} */ (['all', 'miio', 'bluetooth', 'cloud']);

/**
 * @typedef {object} LoginCommandArgs
 * @property {string} username
 * @property {string} password
 * @property {typeof COUNTRIES[number]} country
 * @property {boolean} [verbose]
 */

/**
 * @typedef {object} DevicesCommandArgs
 * @property {typeof CONNECTION_TYPES[number]} type
 * @property {boolean} force
 * @property {boolean} [verbose]
 */

const ensureConfigDir = async () => {
	try {
		await mkdir(CONFIG_DIR, { recursive: true });
	} catch (error) {
		console.error(`Error creating config directory at ${CONFIG_DIR}:`, error);
		process.exit(1);
	}
};

const readJsonFile = async (/** @type {string} */ filePath) => {
	try {
		return JSON.parse(await readFile(filePath, 'utf-8'));
	} catch (error) {
		return null;
	}
};

const writeJsonFile = async (/** @type {string} */ filePath, /** @type {object} */ data) => {
	await ensureConfigDir();
	await writeFile(filePath, JSON.stringify(data, null, 2));
};

const loadCredentials = () => readJsonFile(CREDENTIALS_FILE);
const saveCredentials = (/** @type {Credentials} */ credentials) => writeJsonFile(CREDENTIALS_FILE, credentials);
const loadCloudDeviceList = () => readJsonFile(CLOUD_DEVICE_LIST_FILE);

const loadDeviceCache = async (/** @type {string} */ type) => {
	const cache = await readJsonFile(DEVICE_CACHE_FILE);
	if (cache && cache.type === type && (Date.now() - cache.timestamp) < CACHE_TTL)
		return cache.devices;
	return null;
};

const saveDeviceCache = async (/** @type {DiscoveredDevice[]} */ devices, /** @type {string} */ type) => {
	writeJsonFile(DEVICE_CACHE_FILE, { timestamp: Date.now(), type, devices });
};

const formatTable = (/** @type {DiscoveredDevice[]} */ devices) => {
	if (!devices || devices.length === 0) {
		console.log('No devices found.');
		return;
	}
	const headers = ['Name', 'Model', 'ID / IP / MAC', 'Token', 'Online'];
	const rows = devices.map(d => [
		d.name || '',
		d.model || '',
		d.id || d.address || d.mac || '',
		d.token || 'N/A',
		typeof d.isOnline === 'boolean' ? (d.isOnline ? 'Yes' : 'No') : 'N/A'
	]);

	const colWidths = headers.map(h => h.length);
	rows.forEach(row => {
		row.forEach((cell, i) => {
			colWidths[i] = Math.max(colWidths[i], String(cell).length);
		});
	});

	const printRow = (/** @type {string[]} */ row) => console.log(row.map((cell, i) => String(cell).padEnd(colWidths[i])).join(' | '));
	const printSeparator = () => console.log(colWidths.map(w => '-'.repeat(w)).join('-|-'));

	printRow(headers);
	printSeparator();
	rows.forEach(printRow);
};

const handleLoginCommand = async (/** @type {LoginCommandArgs} */ argv) => {
	const logLevel = argv.verbose ? 'debug' : 'none';
	const client = new XiaomiMiHome({ credentials: argv, logLevel });
	const handlers = {
		on2fa: async (/** @type {string} */ notificationUrl) => {
			console.warn(`\n--- TWO-FACTOR AUTHENTICATION REQUIRED ---`);
			console.log(`1. Open this URL in your browser:\n${notificationUrl}`);
			console.log(`2. You will receive a verification code via SMS or Email.`);
			return await input({
				message: '3. Enter the verification code here',
				required: true
			});
		}
	};
	try {
		console.log('\nAttempting to log in...');
		const credentials = await client.miot.login(handlers);
		await saveCredentials(credentials);
		console.log(`\n✅ Login successful! Credentials saved to ${CREDENTIALS_FILE}`);
		return credentials;
	} catch (error) {
		console.error(`\n❌ Login failed: ${error.message}`);
		return null;
	}
};

const handleDevicesCommand = async (/** @type {DevicesCommandArgs} */ argv) => {
	const { force, type } = argv;
	const logLevel = argv.verbose ? 'debug' : 'none';
	let credentials = await loadCredentials();
	const devices = await loadCloudDeviceList() || [];
	if ((type === 'cloud' || type === 'all') && !credentials) {
		console.log('Cloud device list requires authentication.');
		credentials = await handleLoginCommand();
		if (!credentials) {
			console.log('Aborting: login is required for cloud-related actions.');
			return;
		}
	}
	if (!force) {
		const cachedDevices = await loadDeviceCache(type);
		if (cachedDevices) {
			console.log(`Displaying cached device list for type "${type}" (use --force to refresh).`);
			formatTable(cachedDevices);
			return;
		}
	}
	console.log(`Searching for devices (type: ${type})... This may take a moment.`);
	const client = new XiaomiMiHome({ credentials, devices, logLevel });
	try {
		let finalDevices = [], cloudDevices = [], localDevices = [];
		const searchCloud = type === 'cloud' || type === 'all';
		const searchLocal = type === 'miio' || type === 'bluetooth' || type === 'all';
		if (searchCloud) {
			cloudDevices = await client.getDevices({ connectionType: 'cloud' });
			await writeJsonFile(CLOUD_DEVICE_LIST_FILE, cloudDevices);
		}
		if (searchLocal) {
			const localSearchType = type === 'all' ? 'miio+bluetooth' : type;
			localDevices = await client.getDevices({ connectionType: localSearchType });
		}
		if (type === 'all') {
			const deviceMap = new Map();
			[...cloudDevices, ...localDevices].forEach(d => {
				const key = d.mac || d.address || d.id;
				if (key)
					deviceMap.set(key, { ...(deviceMap.get(key) || {}), ...d });
			});
			finalDevices = Array.from(deviceMap.values());
		} else
			finalDevices = type === 'cloud' ? cloudDevices : localDevices;
		await saveDeviceCache(finalDevices, type);
		formatTable(finalDevices);
	} catch (error) {
		console.error(`\n❌ Error fetching devices: ${error.message}`);
	} finally {
		await client.destroy();
	}
};

yargs(hideBin(process.argv))
	.command(
		'login',
		'Interactively log in to Xiaomi Cloud and save credentials.',
		(yargs) => {
			return yargs
				.option('username', {
					alias: 'u',
					type: 'string',
					description: 'Xiaomi account username'
				})
				.option('password', {
					alias: 'p',
					type: 'string',
					description: 'Xiaomi account password'
				})
				.option('country', {
					alias: 'c',
					description: 'Xiaomi account country code',
					choices: COUNTRIES
				});
		},
		async (/** @type {ArgumentsCamelCase<LoginCommandArgs>} */ argv) => {
			try {
				if (!argv.username)
					argv.username = await input({
						message: 'Username (Email/Phone/ID)',
						required: true
					});
				if (!argv.password)
					argv.password = await password({
						message: 'Password',
						validate: v => !!v
					});
				if (!argv.country)
					argv.country = await select({
						message: 'Country Code',
						choices: COUNTRIES
					});
			} catch (err) {
				console.log(err.message);
				return;
			}
			await handleLoginCommand(argv);
		}
	)
	.command(
		'devices',
		'List devices from local network and/or cloud.',
		(yargs) => {
			return yargs
				.option('type', {
					description: 'Specify discovery type',
					choices: CONNECTION_TYPES,
					default: 'all'
				})
				.option('force', {
					type: 'boolean',
					description: 'Force a new discovery, ignoring the cache',
					default: false
				});
		},
		async (/** @type {ArgumentsCamelCase<DevicesCommandArgs>} */ argv) => {
			await handleDevicesCommand(argv)
		}
	)
	.option('verbose', {
		type: 'boolean',
		description: 'Run with verbose logging',
		global: true
	})
	.completion('completion', 'Generate completion script')
	.demandCommand(1, '')
	.strict()
	.help().alias('h', 'help')
	.version().alias('v', 'version')
	.parse();
