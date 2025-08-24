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
/** @import { Config as Device } from '../src/device.js' */
/** @import { ArgumentsCamelCase } from 'yargs' */

const CONFIG_DIR = path.join(homedir(), '.config', 'xmihome');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');
const DEVICE_CACHE_FILE = path.join(CONFIG_DIR, 'device_cache.json');
const CONNECTION_TYPES = /** @type {const} */ (['all', 'miio', 'bluetooth', 'cloud']);

/**
 * @typedef {object} LoginCommandArgs
 * @property {string} [username]
 * @property {string} [password]
 * @property {typeof COUNTRIES[number]} [country]
 */

/**
 * @typedef {object} DevicesCommandArgs
 * @property {typeof CONNECTION_TYPES[number]} type
 * @property {boolean} force
 */

const ensureConfigDir = async () => {
	try {
		await mkdir(CONFIG_DIR, { recursive: true });
	} catch (error) {
		console.error(`Error creating config directory at ${CONFIG_DIR}:`, error);
		process.exit(1);
	}
};

const loadCredentials = async () => {
	try {
		const data = await readFile(CREDENTIALS_FILE, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		if (error.code === 'ENOENT')
			return null;
		console.error('Error loading credentials:', error);
		return null;
	}
};

const saveCredentials = async (/** @type {Credentials} */ credentials) => {
	await ensureConfigDir();
	await writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
};

const loadDeviceCache = async () => {
	try {
		const data = await readFile(DEVICE_CACHE_FILE, 'utf-8');
		const cache = JSON.parse(data);
		if ((Date.now() - cache.timestamp) < CACHE_TTL)
			return cache.devices;
	} catch (error) {}
	return null;
};

const saveDeviceCache = async (/** @type {Device[]} */ devices) => {
	await ensureConfigDir();
	const cache = {
		timestamp: Date.now(),
		devices
	};
	await writeFile(DEVICE_CACHE_FILE, JSON.stringify(cache, null, 2));
};

const formatTable = (/** @type {Device[]} */ devices) => {
	if (devices.length === 0) {
		console.log('No devices found.');
		return;
	}
	const headers = ['Name', 'Model', 'ID / IP / MAC', 'Token'];
	const rows = devices.map(d => [
		d.name || '',
		d.model || '',
		d.id || d.address || d.mac || '',
		d.token || 'N/A'
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

const handleLoginCommand = async (/** @type {LoginCommandArgs} */ credentials) => {
	const client = new XiaomiMiHome({ credentials, logLevel: 'debug' });
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

const handleDevicesCommand = async (/** @type {DevicesCommandArgs} */ options) => {
	const { force, type } = options;
	const connectionTypeMap = {
		all: 'miio+bluetooth',
		miio: 'miio',
		bluetooth: 'bluetooth',
		cloud: 'cloud'
	};
	let credentials = await loadCredentials();
	if (type === 'cloud' && !credentials) {
		console.log('Cloud device list requires authentication.');
		credentials = await handleLoginCommand();
		if (!credentials) {
			console.log('Aborting: login is required for cloud devices.');
			return;
		}
	}
	if (!force) {
		const cachedDevices = await loadDeviceCache();
		if (cachedDevices) {
			console.log('Displaying cached device list (use --force to refresh).');
			formatTable(cachedDevices);
			return;
		}
	}
	console.log(`Searching for devices (type: ${type})... This may take a moment.`);
	const client = new XiaomiMiHome({ credentials, logLevel: 'debug' });
	try {
		const devices = await client.getDevices({
			connectionType: /** @type {'miio' | 'bluetooth' | 'cloud' | 'miio+bluetooth'} */ (connectionTypeMap[type])
		});
		await saveDeviceCache(devices);
		formatTable(devices);
	} catch (error) {
		console.error(`\n❌ Error fetching devices: ${error.message}`);
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
	.completion('completion', 'Generate completion script')
	.demandCommand(1, '')
	.strict()
	.help().alias('h', 'help')
	.version().alias('v', 'version')
	.parse();
