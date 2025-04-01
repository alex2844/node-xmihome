#!/usr/bin/env node

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const isRoot = process.getuid && process.getuid() === 0;
const username = os.userInfo().username;

function isDbusRequired() {
	try {
		return ((process.platform === 'linux') && (fs.readdirSync('/sys/class/bluetooth/').length > 0));
	} catch (e) {}
	return false;
}

if (isDbusRequired()){
	if (!fs.existsSync(path.join(__dirname, 'node_modules', 'dbus-next'))) {
		try {
			console.log(`Installing dbus-next...`);
			execSync(`npm install dbus-next@${pkg.conditionalDependencies?.['dbus-next']} --no-save`, { stdio: 'inherit' });
		} catch (error) {
			console.error('Failed to install dbus-next:', error);
		}
	}
	if (!isRoot) {
		const confFile = path.join(__dirname, 'xmihome_bluetooth.conf');
		fs.writeFileSync(confFile, [
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
		].join('\n'), 'utf8');
		console.log(`\n✅ Bluetooth configuration file generated for user: ${username}`);
		console.log(`   File saved to: ${confFile}\n`);
		console.log('INFORMATION:');
		console.log('------------');
		console.log('This configuration file grants your user Bluetooth permissions via D-Bus.');
		console.log('If you encounter "org.freedesktop.DBus.Error.AccessDenied" errors, use the');
		console.log('following command to apply the configuration:');
		console.log('\n   sudo cp ' + confFile + ' /etc/dbus-1/system.d/\n');
		console.log('Then restart the Bluetooth service:');
		console.log('\n   sudo systemctl restart bluetooth\n');
	}
}
