import Device from 'xmihome/device.js';
import crypto from 'crypto';
/** @import { XiaomiMiHome } from 'xmihome' */
/** @import { Config, Property, UuidMapping, Schema } from 'xmihome/device.js' */

/**
 * Класс для управления умным чайником Mi Smart Kettle.
 * @extends Device
 */
export default class YunmiKettle extends Device {
	/** @type {string} */
	static name = 'Mi Smart Kettle';

	/** @type {string[]} */
	static alias = [
		'MiKettle'
	];

	/** @type {string[]} */
	static models = [
		'yunmi.kettle.v2'
	];

	/** @type {UuidMapping} */
	static uuidMap = {
		services: {
			'0000fe95-0000-1000-8000-00805f9b34fb': '0023',
			'01344736-0000-1000-8000-262837236156': '0038'
		},
		characteristics: {
			'00000010-0000-1000-8000-00805f9b34fb': '002b',
			'00000001-0000-1000-8000-00805f9b34fb': '0024',
			'0000aa01-0000-1000-8000-00805f9b34fb': '0039',
			'0000aa04-0000-1000-8000-00805f9b34fb': '0040',
			'0000aa05-0000-1000-8000-00805f9b34fb': '0043',
			'0000aa02-0000-1000-8000-00805f9b34fb': '003c'
		}
	};

	/** @type {Schema} */
	static schema = {
		fields: [
			{ key: 'mac', type: 'text' }
		]
	};

	/**
	 * Возможные значения свойства `action` (действие чайника).
	 * @type {string[]}
	 */
	static ACTION = ['idle', 'heating', 'cooling', 'keeping_warm'];

	/**
	 * Возможные значения свойства `keep_warm_type` (тип поддержания температуры).
	 * @type {string[]}
	 */
	static KEEP_WARM_TYPE = ['boil_and_cool_down', 'heat_to_temperature'];

	/**
	 * Возможные значения свойства `mode` (режим работы чайника).
	 * @type {object}
	 */
	static MODE = { 255: 'none', 1: 'boil', 2: 'keep_warm' };

	/**
	 * @typedef {Omit<Property, 'read'|'write'> & {
	 *   read: (buf: Buffer) => {type: string, temperature: number},
	 *   write: (data?: {temperature?: number, type?: string}) => Buffer
	 * }} KeepWarmSettingsProperty
	 */
	/**
	 * @typedef {Omit<Property, 'read'|'write'> & {
	 *   read: (buf: Buffer) => number,
	 *   write: (hours: number) => Buffer
	 * }} KeepWarmDurationProperty
	 */
	/**
	 * @typedef {Omit<Property, 'read'|'write'> & {
	 *   read: (buf: Buffer) => boolean,
	 *   write: (enabled: boolean) => Buffer
	 * }} KeepWarmRefillProperty
	 */
	/**
	 * @typedef {Omit<Property, 'notify'> & {
	 *   notify: (buf: Buffer) => {
	 *     action: string,
	 *     mode: string,
	 *     keep_warm_set_temperature: number,
	 *     current_temperature: number,
	 *     keep_warm_type: string,
	 *     keep_warm_time: number
	 *   }
	 * }} StatusProperty
	 */
	/**
	 * @type {({
	 *   authInit: Property,
	 *   auth: Property,
	 *   keep_warm_settings: KeepWarmSettingsProperty,
	 *   keep_warm_duration: KeepWarmDurationProperty,
	 *   keep_warm_refill: KeepWarmRefillProperty,
	 *   status: StatusProperty
	 * }) & { [x: string]: Property }}
	 * @property {Property} authInit Характеристика инициализации аутентификации.
	 * @property {Property} auth Характеристика аутентификации.
	 * @property {KeepWarmSettingsProperty} keep_warm_settings Настройки режима поддержания тепла. Позволяет установить целевую температуру и тип подогрева.
	 * @property {KeepWarmDurationProperty} keep_warm_duration Длительность поддержания тепла в часах. Принимает значение от 1 до 12.
	 * @property {KeepWarmRefillProperty} keep_warm_refill Режим "Не кипятить повторно".
	 * @property {StatusProperty} status Статус чайника.
	 */
	properties = {
		'authInit': {
			service: '0000fe95-0000-1000-8000-00805f9b34fb',
			characteristic: '00000010-0000-1000-8000-00805f9b34fb',
			access: []
		},
		'auth': {
			service: '0000fe95-0000-1000-8000-00805f9b34fb',
			characteristic: '00000001-0000-1000-8000-00805f9b34fb',
			access: []
		},
		'keep_warm_settings': {
			service: '01344736-0000-1000-8000-262837236156',
			characteristic: '0000aa01-0000-1000-8000-00805f9b34fb',
			access: ['read', 'write'],
			read: buf => ({
				type: YunmiKettle.KEEP_WARM_TYPE[buf.readUInt8(0)],
				temperature: buf.readUInt8(1)
			}),
			write: ({ temperature = 80, type = 'heat_to_temperature' } = {}) => {
				if ((temperature < 40) || (temperature > 90))
					throw new Error('Temperature must be between 40 and 90 degrees.');
				const typeIndex = YunmiKettle.KEEP_WARM_TYPE.indexOf(type);
				if (typeIndex === -1)
					throw new Error(`Invalid keep_warm_type: ${type}. Available: ${YunmiKettle.KEEP_WARM_TYPE.join(', ')}`);
				const buf = Buffer.alloc(2);
				buf.writeUInt8(typeIndex, 0);
				buf.writeUInt8(temperature, 1);
				return buf;
			}
		},
		'keep_warm_duration': {
			service: '01344736-0000-1000-8000-262837236156',
			characteristic: '0000aa04-0000-1000-8000-00805f9b34fb',
			access: ['read', 'write'],
			read: buf => buf.readUInt8(0) / 2,
			write: hours => {
				if ((hours < 1) || (hours > 12))
					throw new Error('Duration must be between 1 and 12 hours.');
				const buf = Buffer.alloc(1);
				buf.writeUInt8(hours * 2, 0);
				return buf;
			}
		},
		'keep_warm_refill': {
			service: '01344736-0000-1000-8000-262837236156',
			characteristic: '0000aa05-0000-1000-8000-00805f9b34fb',
			access: ['read', 'write'],
			read: buf => buf.readUInt8(0) === 1,
			write: enabled => {
				const buf = Buffer.alloc(1);
				buf.writeUInt8(enabled ? 1 : 0, 0);
				return buf;
			}
		},
		'status': {
			service: '01344736-0000-1000-8000-262837236156',
			characteristic: '0000aa02-0000-1000-8000-00805f9b34fb',
			access: ['notify'],
			notify: buf => ({
				action: YunmiKettle.ACTION[buf.readUInt8(0)],
				mode: YunmiKettle.MODE[buf.readUInt8(1)],
				keep_warm_set_temperature: buf.readUInt8(4),
				current_temperature: buf.readUInt8(5),
				keep_warm_type: YunmiKettle.KEEP_WARM_TYPE[buf.readUInt8(6)],
				keep_warm_time: buf.readUInt16LE(7)
			})
		}
	};

	/** @param {Config} config @param {XiaomiMiHome} client */
	constructor(config, client) {
		super(config, client);
		this.productId = 275;
		if (config.token) {
			this.token = Buffer.from(config.token, 'hex');
			this.client.log('debug', `Kettle: Using provided token for ${this.config.mac}`);
		} else {
			this.token = crypto.randomBytes(12);
			this.client.log('debug', `Kettle: Generating new random token for ${this.config.mac}`);
		}
	};

	/** @override */
	async connect() {
		await super.connect('bluetooth');
	};

	/** @override */
	async auth() {
		if (!this.config.mac)
			throw new Error('Kettle authentication requires a MAC address.');
		this.client.log('info', `Kettle ${this.config.mac}: Starting Bluetooth authentication`);
		const mac = this.config.mac.split(':').map((/** @type {string} */ s) => parseInt(s, 16)).reverse();
		const ma = Buffer.from([
			mac[0], mac[2], mac[5], this.productId & 0xff, this.productId & 0xff, mac[4], mac[5], mac[1]
		]);
		const mb = Buffer.from([
			mac[0], mac[2], mac[5], (this.productId >> 8) & 0xff, mac[4], mac[0], mac[5], this.productId & 0xff
		]);
		this.client.log('debug', `Kettle ${this.config.mac}: Calculated ma=${ma.toString('hex')}, mb=${mb.toString('hex')}`);

		const authInit = await this.device.getCharacteristic(this.properties.authInit);
		this.client.log('debug', `Kettle ${this.config.mac}: Writing auth init sequence`);
		await authInit.writeValue(Buffer.from([0x90, 0xCA, 0x85, 0xDE]));

		const auth = await this.device.getCharacteristic(this.properties.auth);
		await auth.startNotifications();
		this.client.log('debug', `Kettle ${this.config.mac}: Started auth notifications, writing token`);

		await new Promise((resolve, reject) => {
			auth.once('valuechanged', (/** @type {any} */ buffer) => {
				this.client.log('debug', `Kettle ${this.config.mac}: Received auth challenge: ${buffer.toString('hex')}`);
				const value = this.cipher(mb, this.cipher(ma, buffer));
				this.client.log('debug', `Kettle ${this.config.mac}: Decrypted challenge: ${value.toString('hex')}, Expected token: ${this.token.toString('hex')}`);
				// if (value.toString('hex') === this.token.toString('hex')) {
				if (Buffer.compare(value, this.token) === 0) {
					this.client.log('debug', `Kettle ${this.config.mac}: Auth challenge successful`);
					resolve();
				} else {
					this.client.log('error', `Kettle ${this.config.mac}: Auth challenge failed! Token mismatch.`);
					reject('Not valid token');
				}
			});
			const encryptedToken = this.cipher(ma, this.token);
			this.client.log('debug', `Kettle ${this.config.mac}: Writing encrypted token: ${encryptedToken.toString('hex')}`);
			auth.writeValue(encryptedToken);
		});
		this.client.log('debug', `Kettle ${this.config.mac}: Writing final auth confirmation`);
		await auth.writeValue(this.cipher(this.token, Buffer.from([0x92, 0xAB, 0x54, 0xFA])));
		await auth.stopNotifications();
		this.client.log('info', `Kettle ${this.config.mac}: Bluetooth authentication successful`);
	};

	/**
	 * Шифрует данные с использованием RC4-подобного алгоритма.
	 * @private
	 * @param {Buffer} key Ключ шифрования.
	 * @param {Buffer} input Входные данные для шифрования.
	 * @returns {Buffer} Зашифрованные данные.
	 */
	cipher(key, input) {
		const perm = Array.from(Array(256).keys());
		// const output = new Uint8Array(input.length);
		const output = Buffer.alloc(input.length);
		const keyLen = key.length;
		let j = 0;
		for (let i = 0; i < 256; i++) {
			j = (j + perm[i] + key[i % keyLen]) % 256;
			[perm[i], perm[j]] = [perm[j], perm[i]];
		}
		let index1 = 0;
		let index2 = 0;
		for (let i = 0; i < input.length; i++) {
			index1 = (index1 + 1) % 256;
			index2 = (index2 + perm[index1]) % 256;
			[perm[index1], perm[index2]] = [perm[index2], perm[index1]];
			const idx = (perm[index1] + perm[index2]) % 256;
			output[i] = input[i] ^ perm[idx];
		}
		return output;
	};
};
