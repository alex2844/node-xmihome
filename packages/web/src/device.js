import EventEmitter from 'events';
import Bluetooth, { BluetoothDevice } from './bluetooth.js';
/** @import { Config, Property, UuidMapping } from 'xmihome/device.js' */

/**
 * Легковесная версия базового класса Device для браузера.
 * @extends EventEmitter
 */
export default class Device extends EventEmitter {
	/** @type {string[]} */ static alias = [];
	/** @type {string[]} */ static models = [];
	/** @type {Object.<string, Property>} */ static properties = {};
	/** @type {UuidMapping} */ static uuidMap = {
		services: {},
		characteristics: {}
	};
	/** @type {Object.<string, typeof Device>} */ static #classes = {};

	/**
	 * @param {Object.<string, typeof Device>} models
	 */
	static registerModels(models) {
		this.#classes = models;
	};

	/**
	 * @returns {string[]}
	 */
	static getModels() {
		return Object.keys(this.#classes);
	};

	/**
	 * @param {Config} device - Объект с данными обнаруженного устройства (должен иметь `model` или `name`).
	 * @returns {typeof Device|undefined} - Найденный класс устройства или undefined.
	 */
	static findModel(device) {
		for (const model of Object.values(this.#classes)) {
			if (model.valid(device, model))
				return model;
		}
	};

	/**
	 * @param {Config} device Объект с данными обнаруженного или создаваемого устройства (должен иметь `model` или `name`).
	 * @param {typeof Device} model Класс (конструктор) конкретной модели устройства для проверки.
	 * @returns {boolean} `true`, если устройство соответствует модели, `false` в противном случае.
	 */
	static valid(device, model) {
		return device.model ? model.models?.includes(device.model) : model.alias?.includes(device.name);
	};

	/**
	 * @param {{ model: string }} device
	 * @param {any} client
	 * @returns {Promise<Device>}
	 */
	static async create(device, client) {
		const model = this.findModel(device);
		if (!model)
			throw new Error(`Device model "${device.model}" not found or not registered.`);
		return new model(device, client);
	};

	/**
	 * @type {Object.<string, {characteristic: object}>}
	 */
	notify = {};

	/** @type {Config} */ config = null;

	/** @type {any} */ client = null;

	/** @type {BluetoothDevice} */ device = null;

	/**
	 * @param {{ model: string }} config
	 * @param {any} client
	 */
	constructor(config, client) {
		super();
		this.config = config;
		this.client = client;
	};

	/**
	 * @returns {typeof Device}
	 */
	get class() {
		return (/** @type {typeof Device} */ (/** @type {unknown} */ (this.constructor)));
	};

	/**
	 * @type {Object.<string, Property & {key: string}>}
	 */
	get properties() {
		const /** @type {Object.<string, Property & {key: string}>} */ properties = {};
		if (this.class.properties)
			for (const key in this.class.properties) {
				properties[key] = {
					...this.class.properties[key],
					key
				};
			}
		return properties;
	};

	async auth() {}

	async connect() {
		try {
			const bluetooth = new Bluetooth(this.client);
			this.client.log('debug', `Connecting via Bluetooth to ${this.config.model}`);
			this.device = await bluetooth.getDevice(this);
			this.proxy = await this.device.connect();
			await this.auth();
		} catch (err) {
			this.device = null;
			this.proxy = null;
			throw err;
		}
	};

	async disconnect() {
		if (this.device) {
			await this.device.disconnect();
			this.device = null;
		}
	};

	/**
	 * @param {string|Property} prop
	 * @returns {Promise<object>}
	 */
	async getProperty(prop) {
		if (typeof prop === 'string')
			prop = this.properties[prop];
		const value = await (await this.device.getCharacteristic({
			service: prop.service,
			characteristic: prop.characteristic
		})).readValue();
		return prop.read(value);
	};

	/**
	 * @param {string|Property} prop
	 * @param {object} value
	 * @throws {Error}
	 */
	async setProperty(prop, value) {
		if (typeof prop === 'string')
			prop = this.properties[prop];
		if (!prop.access?.includes('write'))
			throw new Error('Property is not writable');
		await (await this.device.getCharacteristic({
			service: prop.service,
			characteristic: prop.characteristic
		})).writeValue(prop.write(value));
	};

	/**
	 * @param {string|Property & {key: string}} prop
	 * @param {function} callback
	 * @throws {Error}
	 */
	async startNotify(prop, callback) {
		let lastValue = null;
		if (typeof prop === 'string')
			prop = this.properties[prop];
		if (!prop.access?.includes('notify'))
			throw new Error('Property does not support notifications');
		if (!this.notify[prop.key])
			this.notify[prop.key] = {
				characteristic: await this.device.getCharacteristic({
					service: prop.service,
					characteristic: prop.characteristic
				})
			};
		this.notify[prop.key].characteristic.on('valuechanged', (/** @type {Buffer} */ buf) => {
			const value = (prop.notify || prop.read)(buf);
			const str = JSON.stringify(value);
			if (str !== lastValue) {
				lastValue = str;
				callback(value);
			}
		});
		await this.notify[prop.key].characteristic.startNotifications();
	};

	/**
	 * @param {string|Property & {key: string}} prop
	 */
	async stopNotify(prop) {
		if (typeof prop === 'string')
			prop = this.properties[prop];
		if (this.notify[prop.key]) {
			this.notify[prop.key].characteristic.removeAllListeners('valuechanged');
			await this.notify[prop.key].characteristic.stopNotifications();
			delete this.notify[prop.key];
		}
	};
};
