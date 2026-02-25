import XiaomiMiHome from 'xmihome';
import { CACHE_TTL } from 'xmihome/constants.js';
/** @import { Credentials } from 'xmihome' */
/** @import { default as Device, Config as DeviceConfig } from 'xmihome/device.js' */
/** @import { Node, NodeAPI, NodeDef } from 'node-red' */
/** @import { Request, Response } from 'express' */
/** @import { DeviceNode } from '../device/runtime.js' */

/**
 * Глобальный Map для отслеживания активных процессов обновления списка устройств.
 * Предотвращает одновременный запуск нескольких обновлений для одного и того же узла.
 * Ключ - ID узла (string), значение - Promise, который разрешается в массив устройств.
 * @type {Map<string, Promise<DeviceConfig[]>>}
 */
const refreshPromises = new Map();

/**
 * Глобальный Map для хранения активных сессий авторизации.
 * Позволяет ставить логин на паузу для ввода 2FA или капчи,
 * обновляя объект ответа (res) для правильной цепочки запросов.
 * Ключ - stateToken (string), значение - { resolve, res }.
 * @type {Map<string, { resolve: ((value: string) => void) | null, res: Response }>}
 */
const authSessions = new Map();

/**
 * @typedef {{
 *   debug: boolean;
 *   credentialsFile: string;
 *   connectionType: ('auto'|'cloud'|'miio'|'bluetooth');
 * }} Config
 */
/** @typedef {NodeDef & Config} ConfigDef */
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

	/**
	 * Кеш созданных экземпляров устройств `xmihome/device`.
	 * @type {Map<string, Device>}
	 */
	devices = new Map();

	/**
	 * Хранилище активных подписок на уведомления от устройств.
	 * Ключ: `${deviceId}_${property}` или `${deviceId}_monitoring`
	 * @type {Map<string, {
	 *   device: Device,
	 *   property?: string,
	 *   callback: Function,
	 *   nodes: Set<DeviceNode>
	 * }>}
	 */
	subscriptions = new Map();

	/**
	 * Таймеры для отложенного отключения от устройств.
	 * @type {Map<string, NodeJS.Timeout>}
	 */
	disconnectTimers = new Map();

	/** @type {Record<string, string>} */
	endpoint = {};

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
		this.endpoint['devices'] = `/xmihome/${this.#node.id}/devices`;
		this.endpoint['auth'] = `/xmihome/${this.#node.id}/auth`;
		this.endpoint['auth_ticket'] = `/xmihome/${this.#node.id}/auth/submit_ticket`;
		this.endpoint['auth_captcha'] = `/xmihome/${this.#node.id}/auth/submit_captcha`;
		this.#RED.httpAdmin.get(this.endpoint['devices'], RED.auth.needsPermission('xmihome-config.read'), this.#getDevicesHandler.bind(this));
		this.#RED.httpAdmin.post(this.endpoint['auth'], RED.auth.needsPermission('xmihome-config.write'), this.#handleAuth.bind(this));
		this.#RED.httpAdmin.post(this.endpoint['auth_ticket'], RED.auth.needsPermission('xmihome-config.write'), this.#handleAuthSubmitTicket.bind(this));
		this.#RED.httpAdmin.post(this.endpoint['auth_captcha'], RED.auth.needsPermission('xmihome-config.write'), this.#handleAuthSubmitCaptcha.bind(this));
		this.#node.on('close', this.#close.bind(this));
	};

	/**
	 * @returns {XiaomiMiHome}
	 */
	get client() {
		if (!this.#client)
			this.#client = new XiaomiMiHome({
				credentials: this.#node.credentials,
				credentialsFile: this.#config.credentialsFile,
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
	 * @param {Request} req
	 * @param {Response} res
	 */
	async #handleAuth(req, res) {
		const { username, password, country } = req.body;
		if (!username || !password || !country)
			return res.status(400).json({ error: 'Username, password, and country are required.' });

		const credentials = {
			country, username,
			password: (password === '__PWRD__') ? this.#node.credentials.password : password
		};
		const client = new XiaomiMiHome({
			credentials,
			logLevel: this.#config.debug ? 'debug' : 'none'
		});

		const stateToken = this.#RED.util.generateId();

		const session = { res, resolve: null };
		authSessions.set(stateToken, session);

		const handlers = {
			on2fa: (/** @type {string} */ notificationUrl) => {
				this.#node.debug(`2FA is required. Pausing login process with stateToken: ${stateToken}`);
				return new Promise((resolve, reject) => {
					session.resolve = resolve;
					if (!session.res.headersSent)
						session.res.json({
							notificationUrl, stateToken,
							status: '2fa_required'
						});
					setTimeout(() => {
						if (authSessions.has(stateToken)) {
							authSessions.delete(stateToken);
							reject(new Error('2FA prompt timed out after 5 minutes.'));
						}
					}, CACHE_TTL);
				});
			},
			onCaptcha: (/** @type {string} */ imageB64) => {
				this.#node.debug(`Captcha is required. Pausing login process with stateToken: ${stateToken}`);
				return new Promise((resolve, reject) => {
					session.resolve = resolve;
					if (!session.res.headersSent)
						session.res.json({
							imageB64, stateToken,
							status: 'captcha_required'
						});
					setTimeout(() => {
						if (authSessions.has(stateToken)) {
							authSessions.delete(stateToken);
							reject(new Error('Captcha prompt timed out after 5 minutes.'));
						}
					}, CACHE_TTL);
				});
			}
		};
		try {
			const tokens = await client.miot.login(handlers);
			this.#RED.nodes.addCredentials(this.#node.id, { ...credentials, ...tokens });
			if (session.res && !session.res.headersSent)
				session.res.json({
					status: 'success',
					message: 'Login successful! Deploy your changes.'
				});
		} catch (error) {
			this.#node.error(`Interactive login error: ${error.stack || error.message}`);
			if (session.res && !session.res.headersSent)
				session.res.status(401).json({ error: error.message });
		} finally {
			authSessions.delete(stateToken);
		}
	};

	/**
	 * @param {Request} req
	 * @param {Response} res
	 */
	#handleAuthSubmitTicket(req, res) {
		const { stateToken, ticket } = req.body;
		if (!stateToken || !ticket)
			return res.status(400).json({ error: 'Missing parameters.' });
		const session = authSessions.get(stateToken);
		if (session?.resolve) {
			this.#node.debug(`Resuming login with ticket.`);
			session.res = res;
			const resolve = session.resolve;
			session.resolve = null;
			resolve(ticket);
		} else
			res.status(408).json({ error: 'Login session expired or invalid.' });
	};

	/**
	 * @param {Request} req
	 * @param {Response} res
	 */
	#handleAuthSubmitCaptcha(req, res) {
		const { stateToken, captCode } = req.body;
		if (!stateToken || !captCode)
			return res.status(400).json({ error: 'Missing parameters.' });
		const session = authSessions.get(stateToken);
		if (session?.resolve) {
			this.#node.debug(`Resuming login with captcha code.`);
			session.res = res;
			const resolve = session.resolve;
			session.resolve = null;
			resolve(captCode);
		} else
			res.status(408).json({ error: 'Login session expired or invalid.' });
	};

	/**
	 * @param {boolean} removed
	 * @param {() => void} done
	 */
	async #close(removed, done) {
		this.#node.debug(`Closing config node ${this.#node.id} (removed: ${!!removed})`);
		refreshPromises.delete(this.#node.id);
		authSessions.clear();
		const endpoints = Object.values(this.endpoint);
		const routes = this.#RED.httpAdmin._router.stack;
		for (let i = routes.length - 1; i >= 0; i--) {
			if (routes[i].route && endpoints.includes(routes[i].route.path))
				routes.splice(i, 1);
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
			country: { type: 'text' },
			userId: { type: 'text' },
			ssecurity: { type: 'text' },
			serviceToken: { type: 'text' }
		}
	});
};
