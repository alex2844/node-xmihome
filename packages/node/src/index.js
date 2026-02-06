import { debuglog, inspect } from 'util';
import EventEmitter from 'events';
import Device from './device.js';
import Miot from './miot.js';
import Bluetooth from './bluetooth.js';
import { LOG_LEVELS, DEFAULT_LOG_LEVEL, LIB_ID, UUID, COUNTRIES } from './constants.js';
import { CREDENTIALS_FILE } from './paths.js';
import { devices } from 'xmihome-devices';
/** @import { Config as DeviceConfig, DiscoveredDevice } from './device.js' */

/**
 * @typedef {Object} Credentials
 * @property {(typeof COUNTRIES)[number]} [country] Страна для облачного подключения (например, 'ru', 'cn').
 * @property {string} [username] Имя пользователя для облачного подключения.
 * @property {string} [password] Пароль для облачного подключения.
 * @property {string|number} [userId] ID пользователя Xiaomi. Если указан вместе с ssecurity и serviceToken, авторизация пропускается.
 * @property {string} [ssecurity] Ключ безопасности ssecurity. Если указан вместе с userId и serviceToken, авторизация пропускается.
 * @property {string} [serviceToken] Токен сервиса serviceToken. Если указан вместе с userId и ssecurity, авторизация пропускается.
 */

/**
 * @typedef {Object} Config
 * @property {Credentials} [credentials] Учетные данные для облачного подключения.
 * @property {string} [credentialsFile] Путь к файлу с учетными данными.
 * @property {('miio'|'bluetooth'|'cloud')} [connectionType] Тип подключения по умолчанию.
 * @property {DeviceConfig[]} [devices] Массив устройств для поиска и подключения.
 * @property {('none'|'error'|'warn'|'info'|'debug')} [logLevel='none'] Уровень логирования через console. По умолчанию 'none'.
 */

/**
 * Класс для взаимодействия с устройствами Xiaomi Mi Home.
 * @extends EventEmitter
 */
export default class XiaomiMiHome extends EventEmitter {
	/**
	 * Экземпляр debuglog для вывода отладочной информации при NODE_DEBUG=xmihome.
	 */
	#debugLog;

	/**
	 * Флаг, указывающий, включен ли вывод через NODE_DEBUG=xmihome.
	 * @type {boolean}
	 */
	#isDebugEnvEnabled = false;

	/**
	 * Числовой уровень логирования, установленный через конструктор.
	 * @type {number}
	 */
	#logLevelNumber = LOG_LEVELS[DEFAULT_LOG_LEVEL];

	/**
	 * Экземпляр класса Miot для взаимодействия через MiIO и облако.
	 * Инициализируется лениво через геттер `miot`.
	 * @type {Miot|undefined}
	 */
	#miot;

	/**
	 * Экземпляр класса Bluetooth для взаимодействия через Bluetooth LE.
	 * Инициализируется лениво через геттер `bluetooth`.
	 * @type {Bluetooth|undefined}
	 */
	#bluetooth;

	/**
	 * Кэш для хранения активных экземпляров устройств (Device).
	 * @type {Map<string, Device>}
	 */
	#deviceInstances = new Map();

	/**
	 * Конфигурация для подключения.
	 * @type {Config}
	 */
	config = null;

	/**
	 * Конструктор класса XiaomiMiHome.
	 * @param {Config} config Конфигурация для подключения.
	 */
	constructor(config = {}) {
		super();
		this.config = config;
		this.#debugLog = debuglog(LIB_ID);
		this.#isDebugEnvEnabled = process.env.NODE_DEBUG && new RegExp(`\\b${LIB_ID}\\b`, 'i').test(process.env.NODE_DEBUG);
		this.#logLevelNumber = LOG_LEVELS[config?.logLevel] || LOG_LEVELS[DEFAULT_LOG_LEVEL];
		this.log('debug', 'XiaomiMiHome instance created with config:', config);
	};

	/**
	 * Записывает лог-сообщение.
	 * Учитывает logLevel, установленный в конструкторе, и переменную окружения NODE_DEBUG=xmihome.
	 * @param {('error'|'warn'|'info'|'debug')} level Уровень сообщения.
	 * @param {...any} args Аргументы для логирования (как в console.log).
	 */
	log(level, ...args) {
		const prefix = `[${level.toUpperCase()}]`;
		this.#debugLog(prefix, ...args.map(arg => typeof arg === 'object' ? inspect(arg, { depth: null }) : arg));
		if (!this.#isDebugEnvEnabled && (LOG_LEVELS[level] <= this.#logLevelNumber))
			console[level](`[${LIB_ID}]`, prefix, ...args);
	}

	/**
	 * Возвращает экземпляр класса Miot для взаимодействия через MiIO и облако.
	 * @type {Miot}
	 */
	get miot() {
		if (!this.#miot) {
			this.#miot = new Miot(this);
			this.log('debug', 'Creating Miot instance');
		}
		return this.#miot;
	};

	/**
	 * Возвращает экземпляр класса Bluetooth для взаимодействия через Bluetooth LE.
	 * @type {Bluetooth}
	 */
	get bluetooth() {
		if (!this.#bluetooth)
			this.#bluetooth = new Bluetooth(this);
		return this.#bluetooth;
	};

	/**
	 * Освобождает ресурсы, используемые экземпляром XiaomiMiHome.
	 * В настоящее время останавливает Bluetooth-адаптер и связанные с ним процессы
	 * (сканирование, подключенные устройства).
	 * @returns {Promise<void>}
	 */
	async destroy() {
		this.log('info', 'XiaomiMiHome client destroyed, all cached device instances disconnected.');
		for (const [key, deviceInstance] of this.#deviceInstances.entries()) {
			this.log('debug', `Destroying cached device instance for ${key}`);
			try {
				await deviceInstance.disconnect();
			} catch (err) {
				this.log('warn', `Error disconnecting cached device ${key} during client destroy:`, err);
			}
		}
		this.#deviceInstances.clear();
		if (this.#bluetooth)
			await this.#bluetooth.destroy();
		this.log('info', 'XiaomiMiHome client destroyed successfully.');
	};

	/**
	 * Получает список помещений (домов) пользователя.
	 * @returns {Promise<Array<object>>} Массив объектов помещений.
	 */
	async getHome() {
		this.log('debug', 'Requesting home list from cloud');
		try {
			const { result } = await this.miot.request('/v2/homeroom/gethome', {
				fg: true,
				fetch_share: true,
				fetch_share_dev: true,
				limit: 300,
				app_ver: 7
			});
			this.log('info', `Successfully fetched ${result?.homelist?.length || 0} homes`);
			for (const home of result.homelist) {
				home.id = parseInt(home.id);
			}
			return result.homelist;
		} catch (err) {
			this.log('error', 'Failed to get home list:', err);
			throw err;
		}
	};

	/**
	 * Получает данные об окружающей среде для указанного помещения.
	 * @param {number} home_id Идентификатор помещения.
	 * @returns {Promise<object>} Объект с данными об окружающей среде.
	 */
	async getEnv(home_id) {
		this.log('debug', `Requesting env data for home_id: ${home_id}`);
		try {
			const { result } = await this.miot.request('/v2/home/get_env_data', {
				home_id,
				timestamp: Math.floor(Date.now() / 1_000) - 300,
				prop_event_device: ['temp', 'hum', 'pm25']
			});
			this.log('info', `Successfully fetched env data for home_id: ${home_id}`);
			return result;
		} catch (err) {
			this.log('error', `Failed to get env data for home_id ${home_id}:`, err);
			throw err;
		}
	};

	/**
	 * Создает и возвращает экземпляр класса Device для управления конкретным устройством.
	 * @param {DeviceConfig} deviceConfig Конфигурация устройства.
	 * @returns {Promise<Device>} Promise, который разрешится экземпляром класса Device.
	 */
	async getDevice(deviceConfig) {
		this.log('debug', 'Getting device instance for:', deviceConfig);
		const key = Device.getDeviceId(deviceConfig);
		if (this.#deviceInstances.has(key)) {
			const cachedInstance = this.#deviceInstances.get(key);
			if (cachedInstance.device && (cachedInstance.connectionType !== undefined)) {
				this.log('debug', `Returning cached device instance for: ${key}`);
				return this.#deviceInstances.get(key);
			}
			this.log('debug', `Cached instance ${key} found but seems disconnected. Removing from cache to allow recreation.`);
			this.#deviceInstances.delete(key);
		}
		const instance = await Device.create(deviceConfig, this);
		this.log('debug', `Created new device instance: ${instance.constructor.name} for ${key}`);
		this.#deviceInstances.set(key, instance);
		const onDeviceDisconnect = () => {
			this.log('debug', `Device instance ${key} reported self-disconnect. Removing from cache.`);
			this.#deviceInstances.delete(key);
			instance.off('disconnect', onDeviceDisconnect);
		};
		instance.on('disconnect', onDeviceDisconnect);
		return instance;
	};

	/**
	 * Получает список устройств.
	 * Позволяет настроить тип поиска и прервать его досрочно с помощью callback-функции.
	 * @param {object} [options] Опции для поиска устройств.
	 * @param {number} [options.timeout=10000] Таймаут для локального поиска в миллисекундах.
	 * @param {('miio'|'bluetooth'|'miio+bluetooth'|'cloud')} [options.connectionType] Предпочитаемый тип поиска.
	 * @param {(
	 *   device: DiscoveredDevice,
	 *   devices: DiscoveredDevice[],
	 *   type: 'miio'|'bluetooth'|'cloud'
	 * ) => boolean | {include?: boolean, stop?: boolean}} [options.onDeviceFound]
	 *   Callback-функция, вызываемая для каждого нового уникального устройства. Позволяет фильтровать результаты и досрочно останавливать поиск.
	 *   - `device`: Объект только что найденного устройства.
	 *   - `devices`: Массив уже добавленных устройств.
	 *   - `type`: Тип протокола, по которому было найдено устройство ('miio', 'bluetooth' или 'cloud').
	 *   - Возвращаемое значение управляет процессом:
	 *     - `true` (по умолчанию, если коллбэк не указан): Добавить устройство и продолжить поиск.
	 *     - `false` или `undefined`: Игнорировать устройство и продолжить поиск.
	 *     - Объект `{ include: boolean, stop: boolean }`:
	 *       - `include: true`: Добавить устройство в итоговый список.
	 *       - `stop: true`: Немедленно остановить поиск после обработки текущего устройства.
	 * @returns {Promise<DiscoveredDevice[]>} Promise, который разрешится массивом объектов найденных устройств.
	 * @throws {Error} Если запрошен тип 'cloud', но учетные данные не предоставлены, или если указан неверный `connectionType`.
	 */
	async getDevices({
		timeout = 10_000,
		connectionType = this.config.connectionType,
		onDeviceFound = null
	} = {}) {
		const { username, password, userId, ssecurity, serviceToken } = this.config.credentials || {};
		const hasCredentials = !!((username && password) || (userId && ssecurity && serviceToken) || this.config.credentialsFile);
		const discoveryStrategy = connectionType || (hasCredentials ? 'cloud' : 'miio+bluetooth');
		this.log('info', `Starting device discovery using strategy: "${discoveryStrategy}"`);
		switch (discoveryStrategy) {
			case 'cloud': {
				if (!hasCredentials) {
					const msg = 'Cannot fetch from cloud: credentials are required but missing.';
					this.log('error', msg);
					throw new Error(msg);
				}
				return this.#getCloudDevices(onDeviceFound);
			};
			case 'miio':
			case 'bluetooth':
			case 'miio+bluetooth': {
				return this.#getLocalDevices(discoveryStrategy, timeout, onDeviceFound);
			};
			default: {
				const msg = `Invalid connectionType: "${connectionType}". Allowed: 'cloud', 'miio', 'bluetooth' or undefined.`;
				this.log('error', msg);
				throw new Error(msg);
			};
		}
	};

	/**
	 * Получает список устройств из Xiaomi Cloud.
	 * @param {Function|null} onDeviceFound - Коллбэк от пользователя.
	 * @returns {Promise<DiscoveredDevice[]>} Promise с массивом устройств из облака.
	 * @throws {Error} Перебрасывает ошибку от API в случае неудачного запроса.
	 */
	async #getCloudDevices(onDeviceFound) {
		this.log('info', 'Fetching device list from Xiaomi Cloud');
		try {
			const { result } = await this.miot.request('/home/device_list', {});
			this.log('info', `Found ${result.list.length} raw devices in the cloud.`);
			this.log('debug', 'Raw cloud devices found:', result.list);
			const devices = [];
			this.config.devices = [];
			for (const dev of result.list) {
				let bindkey = '';
				if (dev.did.startsWith('blt.')) {
					const { result: get_beaconkey } = await this.miot.request('/v2/device/blt_get_beaconkey', {
						did: dev.did,
						pdid: 1
					});
					if (get_beaconkey?.beaconkey)
						bindkey = get_beaconkey?.beaconkey;
				}
				const device = {
					id: dev.did,
					name: dev.name,
					model: dev.model,
					token: dev.token,
					address: dev.localip,
					mac: dev.mac,
					bindkey: bindkey,
					isOnline: dev.isOnline
				};
				this.config.devices.push(device);
				if (this.#processFoundDevice(device, devices, 'cloud', onDeviceFound))
					break;
			}
			return devices;
		} catch (err) {
			this.log('error', 'Failed to get device list from cloud:', err);
			throw err;
		}
	};

	/**
	 * Выполняет локальный поиск устройств (MiIO и/или Bluetooth).
	 * Управляет процессом поиска, включая таймаут и досрочное завершение через `onDeviceFound`.
	 * @param {'miio'|'bluetooth'|'miio+bluetooth'} connectionType
	 * @param {number} timeout
	 * @param {Function|null} onDeviceFound - Коллбэк от пользователя.
	 * @returns {Promise<DiscoveredDevice[]>} Promise с массивом найденных локально устройств.
	 */
	async #getLocalDevices(connectionType, timeout, onDeviceFound) {
		const devices = [];
		const cleanupTasks = [];
		let discoveryStopped = false;
		let discoveryResolve;
		const discoveryPromise = new Promise(resolve => { discoveryResolve = resolve; });
		const discoveryStop = () => {
			if (discoveryStopped)
				return;
			discoveryStopped = true;
			this.log('debug', 'Stopping local discovery.');
			discoveryResolve();
		};
		const handleDeviceFound = (
			/** @type {DiscoveredDevice} */ device,
			/** @type {'miio' | 'bluetooth'} */ type
		) => {
			if (discoveryStopped)
				return;
			const isDuplicate = devices.some(d =>
				(d.id && d.id === device.id) ||
				(d.address && d.address === device.address) ||
				(d.mac && d.mac === device.mac)
			);
			if (isDuplicate)
				return;
			if (this.#processFoundDevice(device, devices, type, onDeviceFound))
				discoveryStop();
		};
		this.log('info', `Starting local discovery (${connectionType}) for ${timeout}ms`);
		try {
			const timer = setTimeout(discoveryStop, timeout);
			cleanupTasks.push(() => clearTimeout(timer));
			if (connectionType.includes('miio')) {
				const browser = this.miot.miio.browse();
				const miioListener = (/** @type {object} */ dev) => {
					if (discoveryStopped)
						return;
					const id = (dev.id || '').toString();
					const model = dev.hostname?.replace(/_.*$/, '').replace(/-/g, '.');
					const devConfig = this.config.devices?.find(d => (d.id === id) || (d.address === dev.address));
					handleDeviceFound(mergePreferDefined(devConfig, {
						id,
						address: dev.address,
						token: dev.token,
						model: (model?.split('.').length >= 3) ? model : undefined,
						isOnline: true
					}, ['isOnline']), 'miio');
				};
				browser.on('available', miioListener);
				cleanupTasks.push(() => {
					this.log('debug', 'Cleaning up MiIO listener and browser.');
					browser.off('available', miioListener);
					setTimeout(() => browser.stop(), 500);
				});
				this.log('debug', 'Started MiIO discovery.');
			}
			if (connectionType.includes('bluetooth')) {
				const btListener = async (/** @type {object} */ dev) => {
					if (discoveryStopped)
						return;
					const devModels = Device.findModel(dev)?.models;
					const devConfig = this.config.devices?.find(d => (d.mac === dev.mac));
					handleDeviceFound(mergePreferDefined(devConfig, {
						name: dev.name,
						mac: dev.mac,
						model: devModels?.[0],
						isOnline: true
					}, ['isOnline']), 'bluetooth');
				};
				try {
					this.bluetooth.on('available', btListener);
					const btStarted = await this.bluetooth.startDiscovery([...UUID]);
					if (btStarted) {
						cleanupTasks.push(async () => {
							this.bluetooth.off('available', btListener);
							await this.bluetooth.stopDiscovery();
						});
						this.log('debug', 'Started Bluetooth discovery.');
					}
				} catch (err) {
					this.log('error', 'Failed to start Bluetooth discovery:', err);
				}
			}
			if (cleanupTasks.length <= 1) {
				this.log('warn', 'No discovery method was successfully started.');
				discoveryStop();
			}
			await discoveryPromise;
		} finally {
			this.log('debug', 'Executing cleanup tasks.');
			cleanupTasks.forEach(task => {
				try {
					task();
				} catch (err) {
					this.log('warn', 'Error during discovery cleanup:', err);
				}
			});
		}
		this.log('info', `Local discovery finished. Found ${devices.length} devices total.`);
		return devices;
	};

	/**
	 * Обрабатывает найденное устройство, применяя коллбэк onDeviceFound.
	 * @param {DiscoveredDevice} device - Найденное устройство.
	 * @param {DiscoveredDevice[]} devices - Массив уже добавленных устройств.
	 * @param {'miio'|'bluetooth'|'cloud'} type - Тип обнаружения.
	 * @param {Function|null} onDeviceFound - Коллбэк от пользователя.
	 * @returns {boolean} - `true`, если поиск следует остановить, иначе `false`.
	 */
	#processFoundDevice(device, devices, type, onDeviceFound) {
		this.log('debug', `Discovered ${type} device data:`, device);
		let decision = { include: true, stop: false };
		if (onDeviceFound) {
			const result = onDeviceFound(device, [...devices], type);
			if (typeof result === 'boolean')
				decision.include = result;
			else if ((typeof result === 'object') && (result !== null))
				decision = { ...decision, ...result };
			else
				decision.include = false;
		}
		if (decision.include) {
			devices.push(device);
			this.log('info', `${type} device added: ${device.model || device.name} at ${device.address || device.mac || device.id}`);
		}
		if (decision.stop)
			this.log('info', `Discovery stopped by onDeviceFound callback.`);
		return decision.stop;
	};
};

/**
 * Приостанавливает выполнение на указанное количество миллисекунд.
 * Этот метод можно прервать с помощью переданного AbortSignal.
 * @param {number} ms Количество миллисекунд для ожидания.
 * @param {AbortSignal} [signal] Опциональный AbortSignal для отмены ожидания.
 * @returns {Promise<void>} Promise, который разрешается после указанной задержки.
 * @throws {Error} Если ожидание было отменено сигналом.
 */
export function sleep(ms, signal = undefined) {
	return new Promise((resolve, reject) => {
		const timerId = setTimeout(resolve, ms);
		if (signal) {
			const abortHandler = () => {
				clearTimeout(timerId);
				reject(new Error('Operation cancelled'));
			};
			signal.addEventListener('abort', abortHandler, { once: true });
			const cleanup = () => signal.removeEventListener('abort', abortHandler);
			const promise = Promise.resolve();
			promise.then(cleanup, cleanup);
		}
	});
};

/**
 * Сливает два объекта. Свойства из `priorityObj` имеют приоритет,
 * но только если их значение не `undefined`.
 * @param {object} [priority={}] - Объект, чьи значения в приоритете.
 * @param {object} [base={}] - Базовый объект со значениями по умолчанию.
 * @param {string[]} [exclude=[]] - Массив ключей, которые нужно игнорировать в `priority` объекте.
 * @returns {object} Новый объединенный объект.
 */
export function mergePreferDefined(priority = {}, base = {}, exclude = []) {
	const definedPriorityValues = Object.fromEntries(
		Object.entries(priority).filter(([key, value]) => ((value !== undefined) && !exclude.includes(key)))
	);
	return { ...base, ...definedPriorityValues };
}

/**
 * Создает Proxy-обертку, которая объединяет два объекта.
 * @template T
 * @template F
 * @param {T} target - Основной объект, который может переопределять методы.
 * @param {F} fallback - Запасной объект, который предоставляет базовую функциональность.
 * @returns {T & F} Готовый к использованию прокси-объект.
 */
export function createFallbackProxy(target, fallback) {
	if ((typeof target !== 'object') || (target === null))
		throw new TypeError('Proxy target must be an object.');
	if ((typeof fallback !== 'object') || (fallback === null))
		throw new TypeError('Proxy fallback must be an object.');
	const proxy = new Proxy(target, {
		get(target, prop, receiver) {
			if (prop in target)
				return Reflect.get(target, prop, receiver);
			const fallbackProp = fallback[prop];
			if (typeof fallbackProp === 'function')
				return fallbackProp.bind(fallback);
			return fallbackProp;
		}
	});
	return /** @type {T & F} */ (proxy);
};

export { XiaomiMiHome, Device, Miot, Bluetooth, CREDENTIALS_FILE };

Device.registerModels(devices);
