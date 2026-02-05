#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

/**
 * @typedef {Object} SetupArgs
 * @property {boolean} [remote] - Генерировать конфиг для удаленного доступа.
 * @property {string} port - Порт (по умолчанию '55555').
 * @property {string} host - Хост (по умолчанию '0.0.0.0').
 * @property {boolean} [help] - Показать справку.
 */

/**
 * Парсинг аргументов.
 * @returns {Promise<SetupArgs>}
 */
async function getArgs() {
	const options = /** @type {const} */ ({
		remote: { type: 'boolean' },
		port: { type: 'string', default: '55555' },
		host: { type: 'string', default: '0.0.0.0' },
		help: { type: 'boolean', short: 'h' }
	});
	try {
		const { parseArgs } = await import('util');
		const { values } = parseArgs({ options, strict: false });
		return /** @type {SetupArgs} */ (values);
	} catch (err) {
		const defaults = Object.fromEntries(Object.entries(options).map(([k, v]) => [k, v.default]));
		return /** @type {SetupArgs} */ (defaults);
	}
};

/**
 * Получает локальный IP адрес для инструкции.
 * @returns {string}
 */
function getLocalIp() {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name]) {
			if (iface.family === 'IPv4' && !iface.internal)
				return iface.address;
		}
	}
	return 'IP';
};

/**
 * Проверяет наличие утилиты 'socat' в системе.
 * @returns {boolean}
 */
function isSocatInstalled() {
	try {
		execSync('socat -V', { stdio: 'ignore' });
		return true;
	} catch (e) {
		return false;
	}
};

/**
 * Проверяет, требуется ли D-Bus на текущей системе.
 * @returns {boolean}
 */
function isDbusRequired() {
	try {
		return ((process.platform === 'linux') && (fs.readdirSync('/sys/class/bluetooth/').length > 0));
	} catch (err) {}
	return false;
};

/**
 * Проверяет, установлен ли модуль.
 * @param {string} moduleName
 * @returns {Promise<boolean>}
 */
async function isModuleInstalled(/** @type {string} */ moduleName) {
	try {
		await import(moduleName);
		return true;
	} catch (err) {
		if (err.code !== 'ERR_MODULE_NOT_FOUND')
			console.error(`Unexpected error while checking for '${moduleName}':`, err);
	}
	return false;
};

/**
 * Генерирует данные конфигурации на основе аргументов.
 * @param {SetupArgs} args
 * @param {string} packageRoot
 * @returns {{file: string, header: string, content: string[], steps: string[]}}
 */
function generateConfigData(args, packageRoot) {
	if (args.remote) {
		const port = args.port;
		const host = args.host;
		const ip = (host === '0.0.0.0') ? getLocalIp() : host;
		const file = path.join(packageRoot, 'xmihome_bluetooth_remote.conf');
		const serviceFile = path.join(packageRoot, 'xmihome-dbus-proxy.service');

		const serviceContent = [
			'[Unit]',
			'Description=XMiHome Bluetooth D-Bus TCP Proxy',
			'After=network.target dbus.socket',
			'',
			'[Service]',
			`ExecStart=/usr/bin/socat TCP-LISTEN:${port},fork,reuseaddr UNIX-CONNECT:/var/run/dbus/system_bus_socket`,
			'Restart=always',
			'User=root',
			'',
			'[Install]',
			'WantedBy=multi-user.target'
		].join('\n');

		fs.writeFileSync(serviceFile, serviceContent, 'utf8');

		return {
			file,
			header: `🌐 REMOTE Bluetooth setup (via socat proxy)`,
			content: [
				'<busconfig>',
				'  <auth>ANONYMOUS</auth>',
				'  <allow_anonymous/>',
				'  <policy context="default">',
				'    <allow send_destination="org.bluez"/>',
				'    <allow send_interface="org.bluez.GattCharacteristic1"/>',
				'    <allow send_interface="org.bluez.GattDescriptor1"/>',
				'    <allow send_interface="org.bluez.LEAdvertisement1"/>',
				'    <allow send_interface="org.freedesktop.DBus.ObjectManager"/>',
				'    <allow send_interface="org.freedesktop.DBus.Properties"/>',
				'  </policy>',
				'</busconfig>'
			],
			steps: [
				'1. INSTALL PERMISSIONS (D-Bus Policy):',
				`   sudo cp ${file} /etc/dbus-1/system.d/`,
				'',
				'2. APPLY CHANGES (Required for new auth methods):',
				'   ⚠️  Warning: This will restart D-Bus and may affect other services.',
				'   sudo systemctl restart dbus',
				'',
				'3. PROXY SETUP (Pick one):',
				'   A) TEMPORARY (Stops after terminal close or reboot):',
				`      sudo socat TCP-LISTEN:${port},fork,reuseaddr UNIX-CONNECT:/var/run/dbus/system_bus_socket`,
				'',
				'   B) PERMANENT (Auto-start on boot):',
				`      sudo cp ${serviceFile} /etc/systemd/system/`,
				'      sudo systemctl daemon-reload',
				'      sudo systemctl enable --now xmihome-dbus-proxy',
				'',
				'4. CLIENT CONFIGURATION:',
				`   export DBUS_SYSTEM_BUS_ADDRESS=tcp:host=${ip},port=${port}`
			]
		};
	}

	const username = os.userInfo().username;
	const file = path.join(packageRoot, 'xmihome_bluetooth.conf');

	return {
		file,
		header: `✅ Local Bluetooth configuration for user: ${username}`,
		content: [
			'<busconfig>',
			`  <policy user="${username}">`,
			'    <allow own="org.bluez"/>',
			'    <allow send_destination="org.bluez"/>',
			'    <allow send_interface="org.bluez.GattCharacteristic1"/>',
			'    <allow send_interface="org.bluez.GattDescriptor1"/>',
			'    <allow send_interface="org.bluez.LEAdvertisement1"/>',
			'    <allow send_interface="org.freedesktop.DBus.ObjectManager"/>',
			'    <allow send_interface="org.freedesktop.DBus.Properties"/>',
			'  </policy>',
			'</busconfig>'
		],
		steps: [
			'1. INSTALL PERMISSIONS (D-Bus Policy):',
			`   sudo cp ${file} /etc/dbus-1/system.d/`,
			'',
			'2. APPLY CHANGES (Required for new auth methods):',
			'   ⚠️  Warning: This will restart D-Bus and may affect other services.',
			'   sudo systemctl restart dbus',
		]
	};
};

async function main() {
	const args = await getArgs();

	if (args.help) {
		console.log('Usage: xmihome-bluetooth-setup [options]');
		console.log('\nOptions:');
		console.log('  --remote        Generate configuration for remote D-Bus access');
		console.log('  --port=NUMBER   Port for remote access (default: 55555)');
		console.log('  --host=IP       Host to listen on (default: 0.0.0.0)');
		console.log('  --help, -h      Show this help message');
		return;
	}

	if (!isDbusRequired()) {
		console.log('✅ D-Bus setup is not required on this system (not Linux or no Bluetooth adapters found).');
		return;
	}

	const dbusInstalled = await isModuleInstalled('dbus-next');
	if (!dbusInstalled) {
		console.error('\n❌ ERROR: The `dbus-next` module is not installed.');
		console.error('   This module is required for Bluetooth functionality on Linux.');
		console.error('\n   It should have been installed automatically as an optional dependency.');
		console.error('   Its absence might indicate a problem during the initial `npm install` or `bun install`.');
		console.error('\n   Please try reinstalling the package dependencies or install it manually:');
		console.error('   > npm install dbus-next@github:dcodeIO/node-dbus-next');
		process.exit(1);
	}

	const __filename = fileURLToPath(import.meta.url);
	const packageRoot = path.resolve(__filename, '..', '..');
	const { file, content, header, steps } = generateConfigData(args, packageRoot);

	if (args.remote) {
		if (!isSocatInstalled()) {
			console.warn('⚠️  WARNING: "socat" is not installed. Remote proxy will not work.');
			console.warn('   Run: sudo apt update && sudo apt install socat');
		}
	} else {
		const isRoot = process.getuid && process.getuid() === 0;
		if (isRoot) {
			console.warn('⚠️  WARNING: This script is being run as root. It is intended to generate a user-specific config.');
			console.warn('   The generated file will be for the "root" user. This is likely not what you want.');
		}
	}

	try {
		fs.writeFileSync(file, [
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">',
			...content
		].join('\n'), 'utf8');
		console.log(`\n${header}`);
		console.log(`   Config saved to: ${file}\n`);
		console.log('---[ NEXT STEPS ]--------------------------------------------------');
		console.log(steps.join('\n'));
		console.log('-------------------------------------------------------------------\n');
	} catch (err) {
		console.error(`\n❌ ERROR: Failed to write configuration file to ${file}`);
		console.error(err);
		process.exit(1);
	}
};

main();
