import XiaomiMiHome from 'xmihome';
import { CACHE_TTL } from 'xmihome/constants.js';

/**
 * @import { Node, NodeAPI, NodeDef } from 'node-red'
 * @import { Request, Response } from 'express'
 * @import { Config as DeviceConfig } from 'xmihome/device.js'
 */

/**
 * Глобальный Map для отслеживания активных процессов обновления списка устройств.
 * Предотвращает одновременный запуск нескольких обновлений для одного и того же узла.
 * Ключ - ID узла (string), значение - Promise, который разрешается в массив устройств.
 * @type {Map<string, Promise<DeviceConfig[]>>}
 */
const refreshPromises = new Map();

/**
 * @typedef {{
 *   debug: boolean;
	 connectionType: ('auto'|'cloud'|'miio'|'bluetooth');
 * }} Config
 */
/** @typedef {NodeDef & Config} ConfigDef */

/**
 * @typedef {{
 *   username: string;
 *   password: string;
 *   country: ('sg'|'cn'|'ru'|'us'|'tw'|'de');
 * }} Credentials
 */

/** @typedef {Node<Credentials> & { instance: ConfigNode }} NodeInstance */

export class ConfigNode {
	/**
	 * Экземпляр Node-RED Node API, предоставляемый модулю при загрузке.
	 * @type {NodeAPI}
	 */
	#RED;

	/**
	 * Конкретный экземпляр этого узла, созданный Node-RED.
	 * Это наш главный объект для взаимодействия со средой: отправки сообщений,
	 * установки статуса, логирования, доступа к credentials и т.д.
	 * @type {NodeInstance}
	 */
	#node;

	/**
	 * Объект с конфигурацией узла, которая была задана пользователем в редакторе.
	 * Содержит значения из секции `defaults` в HTML-файле.
	 * @type {ConfigDef}
	 */
	#config;

	/**
	 * Клиент.
	 * @type {XiaomiMiHome}
	 */
	#client;

	/** @type {string} */
	endpoint;

	/**
	 * Кеш списка устройств для предотвращения частых запросов к API.
	 * @type {{
	 *   devices: DeviceConfig[];
	 *   timestamp: number;
	 *   error: string|null;
	 * }}
	 */
	deviceCache = {
		devices: [],
		timestamp: 0,
		error: null
	};

	/**
	 * @param {NodeInstance} node
	 * @param {ConfigDef} config
	 * @param {NodeAPI} RED
	 */
	constructor(node, config, RED) {
		this.#node = node;
		this.#config = config;
		this.#RED = RED;

		this.endpoint = `/xmihome/${this.#node.id}/devices`;
		this.#RED.httpAdmin.get(this.endpoint, RED.auth.needsPermission('xmihome-config.read'), this.#getDevicesHandler.bind(this));
		this.#node.on('close', this.#close.bind(this));
	};

	/**
	 * Геттер для "ленивого" получения клиента из узла конфигурации.
	 * @returns {XiaomiMiHome}
	 */
	get client() {
		if (!this.#client)
			this.#client = new XiaomiMiHome({
				credentials: this.#node.credentials,
				connectionType: this.#config.connectionType === 'auto' ? null : this.#config.connectionType,
				logLevel: this.#config.debug ? 'debug' : 'none'
			});
		return this.#client;
	};

	/**
	 * @param {boolean} force
	 * @param {number} timeout
	 */
	async getDevices(force = false, timeout = undefined) {
		if (refreshPromises.has(this.#node.id)) {
			this.#node.debug('Device refresh already in progress, returning existing promise.');
			return refreshPromises.get(this.#node.id);
		}
		const now = Date.now();
		if (!force && (this.deviceCache.devices.length > 0) && ((now - this.deviceCache.timestamp) < CACHE_TTL)) {
			this.#node.debug('Using cached device list (TTL not expired).');
			return Promise.resolve(this.deviceCache.devices);
		}
		this.#node.debug(`Initiating device cache refresh (force=${force})...`);
		this.deviceCache.error = null;
		const refreshPromise = (async () => {
			try {
				const devices = await this.client.getDevices({
					...(timeout && { timeout })
				});
				this.deviceCache.devices = devices || [];
				this.deviceCache.timestamp = Date.now();
				this.#node.log(`Device cache refreshed. Found ${this.deviceCache.devices.length} devices.`);
				return this.deviceCache.devices;
			} catch (err) {
				this.#node.error(`Failed to refresh device cache: ${err.message}`, err);
				this.deviceCache.error = err.message || 'Unknown error';
				throw err;
			} finally {
				refreshPromises.delete(this.#node.id);
				this.#node.debug('Refresh promise removed.');
			}
		})();
		refreshPromises.set(this.#node.id, refreshPromise);
		this.#node.debug('Refresh promise created and stored.');
		return refreshPromise;
	};

	/**
	 * @param {Request} req
	 * @param {Response} res
	 */
	async #getDevicesHandler(req, res) {
		try {
			const devicesPromise = this.getDevices(req.query.force === 'true');
			await devicesPromise;
			res.json({
				devices: this.deviceCache.devices,
				loading: refreshPromises.has(this.#node.id),
				error: this.deviceCache.error,
				timestamp: this.deviceCache.timestamp
			});
		} catch (err) {
			res.status(500).json({
				devices: this.deviceCache.devices,
				loading: false,
				error: err.message || 'Failed to refresh device list',
				timestamp: this.deviceCache.timestamp
			});
		}
	};

	/**
	 * @param {boolean} removed
	 * @param {() => void} done
	 */
	async #close(removed, done) {
		this.#node.debug(`Closing config node ${this.#node.id} (removed: ${!!removed})`);
		refreshPromises.delete(this.#node.id);
		const routes = this.#RED.httpAdmin._router.stack;
		for (let i = routes.length - 1; i >= 0; i--) {
			if (routes[i].route?.path === this.endpoint) {
				routes.splice(i, 1);
				this.#node.debug(`Removed HTTP admin route: ${this.endpoint}`);
				break;
			}
		}
		if (this.#client)
			try {
				await this.#client.destroy();
				this.#node.log('XiaomiMiHome client destroyed.');
			} catch (err) {
				this.#node.error(`Error destroying client: ${err.message}`);
			} finally {
				this.#client = null;
			}
		done();
	};
};

/**
 * @param {NodeAPI} RED
 */
export default function (RED) {
	RED.nodes.registerType('xmihome-config', function (/** @type {ConfigDef} */ config) {
		RED.nodes.createNode(this, config);
		const node = /** @type {NodeInstance} */ (this);
		node.instance = new ConfigNode(node, config, RED);
	}, {
		credentials: {
			username: { type: 'text' },
			password: { type: 'password' },
			country: { type: 'text' }
		}
	});
};
