#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function main() {
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
	const isRoot = process.getuid && process.getuid() === 0;
	if (isRoot) {
		console.warn('⚠️  Warning: This script is being run as root. It is intended to generate a user-specific config.');
		console.warn('   The generated file will be for the "root" user. This is likely not what you want.');
	}
	const username = os.userInfo().username;
	const __filename = fileURLToPath(import.meta.url);
	const packageRoot = path.resolve(__filename, '..', '..');
	const confFile = path.join(packageRoot, 'xmihome_bluetooth.conf');

	const confContent = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">',
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
	].join('\n');

	try {
		fs.writeFileSync(confFile, confContent, 'utf8');
		console.log(`\n✅ Bluetooth configuration file generated successfully for user: ${username}`);
		console.log(`   File saved to: ${confFile}\n`);
		console.log('---[ NEXT STEPS ]--------------------------------------------------');
		console.log('This configuration file grants your user Bluetooth permissions via D-Bus.');
		console.log('If you encounter "org.freedesktop.DBus.Error.AccessDenied" errors,');
		console.log('you must copy this file to the system D-Bus configuration directory.');
		console.log('\nUse the following command:');
		console.log(`\n   sudo cp ${confFile} /etc/dbus-1/system.d/\n`);
		console.log('Then, restart the Bluetooth service for the changes to take effect:');
		console.log('\n   sudo systemctl restart bluetooth\n');
		console.log('-------------------------------------------------------------------');
	} catch (err) {
		console.error(`\n❌ ERROR: Failed to write configuration file to ${confFile}`);
		console.error(err);
		process.exit(1);
	}
};

main();
