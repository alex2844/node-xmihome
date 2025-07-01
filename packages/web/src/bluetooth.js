import EventEmitter from 'events';
import { UUID } from 'xmihome/constants.js';
/** @import Device from './device.js' */

/**
 * Класс-обертка для Web Bluetooth GATT Characteristic.
 * @extends EventEmitter
 */
export class BluetoothCharacteristic extends EventEmitter {
	/**
	 * @param {globalThis.BluetoothRemoteGATTCharacteristic} characteristic
	 */
	constructor(characteristic) {
		super();
		this.native = characteristic;
		this.native.addEventListener('characteristicvaluechanged', event => {
			const target = /** @type {globalThis.BluetoothRemoteGATTCharacteristic} */ (event.target);
			if (target.value)
				this.emit('valuechanged', Buffer.from(target.value.buffer));
		});
	};

	async readValue() {
		const value = await this.native.readValue();
		return Buffer.from(value.buffer);
	};

	/** @param {Buffer} buffer */
	async writeValue(buffer) {
		return this.native.writeValueWithResponse(buffer);
	};

	async startNotifications() {
		return this.native.startNotifications();
	};

	async stopNotifications() {
		return this.native.stopNotifications();
	};
};

/**
 * Класс-обертка для Web Bluetooth Device.
 * @extends EventEmitter
 */
export class BluetoothDevice extends EventEmitter {
	/**
	 * @param {globalThis.BluetoothDevice} device
	 * @param {any} client
	 */
	constructor(device, client) {
		super();
		this.native = device;
		this.client = client;
		/** @type {globalThis.BluetoothRemoteGATTServer} */
		this.gatt = null;
		this.services = new Map();
		this.characteristics = new Map();

		this.native.addEventListener('gattserverdisconnected', () => {
			this.client.log('warn', `GATT server for ${this.native.name} disconnected.`);
			this.emit('disconnect');
		});
	};

	async connect() {
		if (this.gatt?.connected)
			return;
		this.client.log('debug', '[WebBT] Connecting to GATT server...');
		this.gatt = await this.native.gatt.connect();
		this.client.log('info', '[WebBT] GATT server connected.');
		this.emit('connected', 'bluetooth');
	};

	async disconnect() {
		if (this.gatt?.connected) {
			this.client.log('debug', '[WebBT] Disconnecting from GATT server...');
			this.gatt.disconnect();
		}
	};

	/**
	 * @param {{ service: string, characteristic: string }} props
	 */
	async getCharacteristic({ service: serviceUUID, characteristic: characteristicUUID }) {
		const path = `${serviceUUID}/${characteristicUUID}`;
		if (this.characteristics.has(path))
			return this.characteristics.get(path);
		if (!this.gatt?.connected)
			throw new Error('GATT Server not connected.');
		let service;
		if (this.services.has(serviceUUID))
			service = this.services.get(serviceUUID);
		else {
			this.client.log('debug', `[WebBT] Getting service: ${serviceUUID}`);
			service = await this.gatt.getPrimaryService(serviceUUID);
			this.services.set(serviceUUID, service);
		}
		this.client.log('debug', `[WebBT] Getting characteristic: ${characteristicUUID}`);
		const characteristic = await service.getCharacteristic(characteristicUUID);
		const wrappedChar = new BluetoothCharacteristic(characteristic);
		this.characteristics.set(path, wrappedChar);
		return wrappedChar;
	};
};

export default class Bluetooth {
	/**
	 * @param {any} client
	 */
	constructor(client) {
		this.client = client;
	};

	/** @param {Device} options */
	async getDevice(options) {
		this.client.log('debug', '[WebBT] Requesting device with options:', options);
		const device = await navigator.bluetooth.requestDevice({
			filters: [{
				services: UUID
			}],
			optionalServices: [...new Set(
				Object.values(options.properties)
				.map(prop => prop.service)
				.filter(Boolean)
			)]
		});
		return new BluetoothDevice(device, this.client);
	};
};
