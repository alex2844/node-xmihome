import Device from '../device.js';
import crypto from 'crypto';

/**
 * Класс для управления умным чайником Mi Smart Kettle (yunmi.kettle.v2).
 * @extends Device
 */
export default class extends Device {
	/**
	 * Название устройства.
	 * @static
	 * @type {string}
	 */
	static name = 'Mi Smart Kettle';

	/**
	 * Список альтернативных названий устройства (алиасов).
	 * @static
	 * @type {string[]}
	 */
	static alias = [
		'MiKettle'
	];

	/**
	 * Список поддерживаемых моделей устройств.
	 * @static
	 * @type {string[]}
	 */
	static models = [
		'yunmi.kettle.v2'
	];

	/**
	 * Возможные значения свойства `action` (действие чайника).
	 * @static
	 * @type {string[]}
	 */
	static PROP_ACTION = [ 'idle', 'heating', 'cooling', 'keeping_warm' ];

	/**
	 * Возможные значения свойства `keep_warm_type` (тип поддержания температуры).
	 * @static
	 * @type {string[]}
	 */
	static PROP_KEEP_WARM_TYPE = [ 'boil_and_cool_down', 'heat_to_temperature' ];

	/**
	 * Возможные значения свойства `mode` (режим работы чайника).
	 * @static
	 * @type {object}
	 */
	static PROP_MODE = { 255: 'none', 1: 'boil', 2: 'keep_warm' };

	/**
	 * Описание свойств устройства и их параметров для взаимодействия через Bluetooth.
	 * @static
	 * @type {object}
	 * @property {object} authInit Характеристика инициализации аутентификации.
	 * @property {string} authInit.service UUID сервиса Bluetooth.
	 * @property {string} authInit.characteristic UUID характеристики Bluetooth.
	 * @property {object} auth Характеристика аутентификации.
	 * @property {string} auth.service UUID сервиса Bluetooth.
	 * @property {string} auth.characteristic UUID характеристики Bluetooth.
	 * @property {object} setup Характеристика настроек.
	 * @property {string} setup.service UUID сервиса Bluetooth.
	 * @property {string} setup.characteristic UUID характеристики Bluetooth.
	 * @property {object} time Характеристика времени.
	 * @property {string} time.service UUID сервиса Bluetooth.
	 * @property {string} time.characteristic UUID характеристики Bluetooth.
	 * @property {object} keepWarmRefillMode Характеристика режима подогрева.
	 * @property {string} keepWarmRefillMode.service UUID сервиса Bluetooth.
	 * @property {string} keepWarmRefillMode.characteristic UUID характеристики Bluetooth.
	 * @property {object} status Статус чайника.
	 * @property {string} status.service UUID сервиса Bluetooth.
	 * @property {string} status.characteristic UUID характеристики Bluetooth.
	 * @property {function} status.notify Функция для обработки уведомлений об изменении статуса и разбора буфера данных.
	 */
	static properties = {
		'authInit': { service: '0023', characteristic: '002b' },
		'auth': { service: '0023', characteristic: '0024' },
		'setup': { service: '0038', characteristic: '0039' },
		'time': { service: '0038', characteristic: '0040' },
		'keepWarmRefillMode': { service: '0038', characteristic: '0043' },
		'status': {
			service: '0038',
			characteristic: '003c',
			notify: buf => ({
				action: this.PROP_ACTION[buf.readUInt8(0)],
				mode: this.PROP_MODE[buf.readUInt8(1)],
				keep_warm_set_temperature: buf.readUInt8(4),
				current_temperature: buf.readUInt8(5),
				keep_warm_type: this.PROP_KEEP_WARM_TYPE[buf.readUInt8(6)],
				keep_warm_time: buf.readUInt16LE(7)
			})
		}
	};

	/**
	 * Конструктор класса.
	 * @param {object} config Конфигурация устройства.
	 * @param {XiaomiMiHome} client Экземпляр класса XiaomiMiHome.
	 * @constructor
	 */
	constructor(config, client) {
		super(config, client);
		this.productId = 275;
		if (config.token) {
			this.token = Buffer.from(config.token, 'hex');
			this.client.log('debug', `Kettle: Using provided token for ${this.config.mac}`);
		}else{
			this.token = crypto.randomBytes(12);
			this.client.log('debug', `Kettle: Generating new random token for ${this.config.mac}`);
		}
	};

	/**
	 * Устанавливает соединение с устройством.
	 * @async
	 * @override
	 */
	async connect() {
		await super.connect('bluetooth');
	};

	/**
	 * Выполняет специфичную для устройства логику аутентификации.
	 * @async
	 * @override
	 */
	async auth() {
		this.client.log('info', `Kettle ${this.config.mac}: Starting Bluetooth authentication`);
		const mac = this.config.mac.split(':').map(s => parseInt(s, 16)).reverse();
		const ma = Buffer.from([
			mac[0], mac[2], mac[5], this.productId & 0xff, this.productId & 0xff, mac[4], mac[5], mac[1]
		]);
		const mb = Buffer.from([
			mac[0], mac[2], mac[5], (this.productId >> 8) & 0xff, mac[4], mac[0], mac[5], this.productId & 0xff
		]);
		this.client.log('debug', `Kettle ${this.config.mac}: Calculated ma=${ma.toString('hex')}, mb=${mb.toString('hex')}`);

		const authInit = await this.device.getCharacteristic(this.constructor.properties.authInit);
		this.client.log('debug', `Kettle ${this.config.mac}: Writing auth init sequence`);
		await authInit.writeValue(Buffer.from([ 0x90, 0xCA, 0x85, 0xDE ]));

		const auth = await this.device.getCharacteristic(this.constructor.properties.auth);
		await auth.startNotifications();
		this.client.log('debug', `Kettle ${this.config.mac}: Started auth notifications, writing token`);

		await new Promise((resolve, reject) => {
			auth.once('valuechanged', buffer => {
				this.client.log('debug', `Kettle ${this.config.mac}: Received auth challenge: ${buffer.toString('hex')}`);
				const value = this.cipher(mb, this.cipher(ma, buffer));
				this.client.log('debug', `Kettle ${this.config.mac}: Decrypted challenge: ${value.toString('hex')}, Expected token: ${this.token.toString('hex')}`);
				if (value.toString('hex') === this.token.toString('hex')) {
					this.client.log('debug', `Kettle ${this.config.mac}: Auth challenge successful`);
					resolve();
				}else{
					this.client.log('error', `Kettle ${this.config.mac}: Auth challenge failed! Token mismatch.`);
					reject('Not valid token');
				}
			});
			const encryptedToken = this.cipher(ma, this.token);
			this.client.log('debug', `Kettle ${this.config.mac}: Writing encrypted token: ${encryptedToken.toString('hex')}`);
			auth.writeValue(encryptedToken);
		});
		this.client.log('debug', `Kettle ${this.config.mac}: Writing final auth confirmation`);
		await auth.writeValue(this.cipher(this.token, Buffer.from([ 0x92, 0xAB, 0x54, 0xFA ])));
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
			[ perm[i], perm[j] ] = [ perm[j], perm[i] ];
		}
		let index1 = 0;
		let index2 = 0;
		for (let i = 0; i < input.length; i++) {
			index1 = (index1 + 1) % 256;
			index2 = (index2 + perm[index1]) % 256;
			[ perm[index1], perm[index2] ] = [ perm[index2], perm[index1] ];
			const idx = (perm[index1] + perm[index2]) % 256;
			output[i] = input[i] ^ perm[idx];
		}
		return output;
	};
};
