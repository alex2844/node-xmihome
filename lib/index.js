import util from 'util';
import EventEmitter from 'events';
import Device from './device.js';
import Miot from './miot.js';
import Bluetooth from './bluetooth.js';
import { LOG_LEVELS, DEFAULT_LOG_LEVEL, LIB_ID, UUID } from './constants.js';

/**
 * Класс для взаимодействия с устройствами Xiaomi Mi Home.
 * @extends EventEmitter
 */
export class XiaomiMiHome extends EventEmitter {
	/**
	 * Экземпляр debuglog для вывода отладочной информации при NODE_DEBUG=xmihome.
	 * @private
	 */
	#debugLog;

	/**
	 * Флаг, указывающий, включен ли вывод через NODE_DEBUG=xmihome.
	 * @private
	 * @type {boolean}
	 */
	#isDebugEnvEnabled = false;

	/**
	 * Числовой уровень логирования, установленный через конструктор.
	 * @private
	 * @type {number}
	 */
	#logLevelNumber = LOG_LEVELS[DEFAULT_LOG_LEVEL];

	/**
	 * Экземпляр класса Miot для взаимодействия через MiIO и облако.
	 * Инициализируется лениво через геттер `miot`.
	 * @private
	 * @type {Miot | undefined}
	 */
	#miot;

	/**
	 * Экземпляр класса Bluetooth для взаимодействия через Bluetooth LE.
	 * Инициализируется лениво через геттер `bluetooth`.
	 * @private
	 * @type {Bluetooth | undefined}
	 */
	#bluetooth;

	/**
	 * Кэш для хранения активных экземпляров устройств (Device).
	 * @private
	 * @type {Map<string, Device>}
	 */
	#deviceInstances = new Map();

	/**
	 * Конструктор класса XiaomiMiHome.
	 * @param {object} config Конфигурация для подключения.
	 * @param {object} [config.credentials] Учетные данные для облачного подключения.
	 * @param {string} [config.credentials.username] Имя пользователя для облачного подключения.
	 * @param {string} [config.credentials.password] Пароль для облачного подключения.
	 * @param {string} [config.credentials.country] Страна для облачного подключения (например, 'ru', 'cn').
	 * @param {object[]} [config.devices] Массив устройств для поиска и подключения.
	 * @param {string} [config.connectionType] Тип подключения по умолчанию ('miio', 'bluetooth', 'cloud').
	 * @param {('none'|'error'|'warn'|'info'|'debug')} [config.logLevel='none'] Уровень логирования через console. По умолчанию 'none'.
	 */
	constructor(config={}) {
		super();
		this.config = config;
		this.#debugLog = util.debuglog(LIB_ID);
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
		this.#debugLog(prefix, ...args.map(arg => typeof arg === 'object' ? util.inspect(arg, { depth: null }) : arg));
		if (!this.#isDebugEnvEnabled && (LOG_LEVELS[level] <= this.#logLevelNumber))
			console[level](`[${LIB_ID}]`, prefix, ...args);
	}

	/**
	 * Возвращает экземпляр класса Miot для взаимодействия через MiIO и облако.
	 * @type {Miot}
	 * @readonly
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
	 * @readonly
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
	 * @async
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
	 * @async
	 * @returns {Promise<Array<object>>} Массив объектов помещений.
	 */
	async getHome() {
		this.log('debug', 'Requesting home list from cloud');
		try {
			const result = await this.miot.request('/v2/homeroom/gethome', {
				fg: true,
				fetch_share: true,
				fetch_share_dev: true,
				limit: 300,
				app_ver: 7
			});
			this.log('info', `Successfully fetched ${result?.result?.homelist?.length || 0} homes`);
			return result.result.homelist;
		} catch (err) {
			this.log('error', 'Failed to get home list:', err);
			throw err;
		}
	};

	/**
	 * Получает данные об окружающей среде для указанного помещения.
	 * @async
	 * @param {number} home_id Идентификатор помещения.
	 * @returns {Promise<object>} Объект с данными об окружающей среде.
	 */
	async getEnv(home_id) {
		this.log('debug', `Requesting env data for home_id: ${home_id}`);
		try {
			const result = await this.miot.request('/v2/home/get_env_data', {
				home_id,
				timestamp: parseInt(Date.now()/1000)-300,
				prop_event_device: [ 'temp', 'hum', 'pm25' ]
			});
			this.log('info', `Successfully fetched env data for home_id: ${home_id}`);
			return result.result;
		} catch (err) {
			this.log('error', `Failed to get env data for home_id ${home_id}:`, err);
			throw err;
		}
	};

	/**
	 * Получает список сцен для указанного помещения (может возвращать пустой результат).
	 * @async
	 * @param {number} home_id Идентификатор помещения.
	 * @returns {Promise<object>} Объект со списком сцен.
	 */
	async getSceneList(home_id) { // empty result?
		return this.miot.request('/appgateway/miot/appsceneservice/AppSceneService/GetSceneList', { home_id }).then(({ result }) => result);
	};

	/**
	 * Запускает сцену по ее идентификатору.
	 * @async
	 * @param {string} scene_id Идентификатор сцены.
	 * @returns {Promise<object>} Результат выполнения сцены.
	 */
	async runSceneList(scene_id) {
		return this.miot.request('/appgateway/miot/appsceneservice/AppSceneService/RunScene', {
			scene_id,
			trigger_key: 'user.click'
		}).then(({ result }) => result);
	};

	/**
	 * Получает список устройств.
	 * Позволяет настроить тип поиска и прервать его досрочно с помощью callback-функции.
	 *
	 * @async
	 * @param {object} [options={}] Опции для поиска устройств.
	 * @param {number} [options.timeout=10000] Максимальное время ожидания при локальном поиске (MiIO/Bluetooth) в миллисекундах.
	 * @param {('cloud'|'miio'|'bluetooth'|undefined)} [options.connectionType=this.config.connectionType]
	 *   Определяет метод поиска:
	 *   - 'cloud': Только облако Xiaomi (требуются credentials).
	 *   - 'miio': Только MiIO в локальной сети.
	 *   - 'bluetooth': Только Bluetooth LE.
	 *   - undefined (по умолчанию): Облако (если есть credentials), иначе комбинированный MiIO + Bluetooth.
	 * @param {(device: object, devices: Array<object>) => boolean} [options.findCallback]
	 *   Callback-функция, вызываемая при обнаружении *нового* уникального устройства во время локального поиска (MiIO или Bluetooth).
	 *   - `device`: Объект только что найденного устройства.
	 *   - `devices`: Текущий массив всех найденных на данный момент устройств.
	 *   - Если функция возвращает `true`, поиск немедленно прекращается, и `getDevices` возвращает текущий массив `devices`.
	 *   - Если функция возвращает `false` или ничего (`undefined`), поиск продолжается до таймаута или следующего вызова callback, вернувшего `true`.
	 * @returns {Promise<Array<object>>} Promise, который разрешится массивом объектов найденных устройств.
	 * @throws {Error} Если запрошен тип 'cloud', но учетные данные не предоставлены, или если указан неверный `connectionType`.
	 */
	async getDevices(options={}) {
		const {
			timeout = 10000,
			connectionType = this.config.connectionType,
			findCallback
		} = options;
		const isCredentials = this.config.credentials?.username && this.config.credentials?.password;
		if ((connectionType === 'cloud') || (!connectionType && isCredentials)) {
			if (!isCredentials) {
				const msg = 'Cannot fetch devices from cloud: config.connectionType is set to "cloud", but credentials are missing.';
				this.log('error', msg);
				throw new Error(msg);
			}
			this.log('info', 'Fetching device list from Xiaomi Cloud');
			try {
				const result = await this.miot.request('/home/device_list', {});
				const devices = result.result.list.map(device => ({
					id: device.did,
					name: device.name,
					address: device.localip,
					mac: device.mac,
					token: device.token,
					model: device.model,
					isOnline: device.isOnline
				}));
				this.log('info', `Found ${devices.length} devices in the cloud`);
				this.log('debug', 'Cloud devices found:', devices);
				return devices;
			} catch (err) {
				this.log('error', 'Failed to get device list from cloud:', err);
				throw err;
			}
		}else if ((connectionType === 'miio') || (connectionType === 'bluetooth') || !connectionType) {
			const devices = [];
			let models;
			let miioBrowser;
			let btDiscoveryStarted = false;
			let discoveryStopped = false;
			let discoveryTimer = null;
			let _resolvePromise;
			const discoverMiio = connectionType === 'miio' || !connectionType;
			const discoverBluetooth = connectionType === 'bluetooth' || !connectionType;
			const discoverText = `${discoverMiio ? 'MiIO' : ''}${discoverMiio && discoverBluetooth ? ' + ' : ''}${discoverBluetooth ? 'Bluetooth' : ''}`;
			this.log('info', `Starting local discovery (${discoverText}) for ${timeout}ms`);

			const stopDiscoverySignal = async () => {
				if (discoveryStopped)
					return;
				discoveryStopped = true;
				this.log('debug', 'Stopping discovery signal received (timeout or callback)');

				clearTimeout(discoveryTimer);

				if (miioBrowser) {
					try {
						miioBrowser.off('available', miioListener);
						miioBrowser.stop();
						this.log('debug', 'Stopped MiIO discovery browser');
					} catch (err) {
						this.log('warn', 'Error stopping MiIO browser:', err);
					}
					miioBrowser = null;
				}
				if (btDiscoveryStarted) {
					try {
						this.bluetooth.off('available', btListener);
						await this.bluetooth.stopDiscovery();
						this.log('debug', 'Stopped Bluetooth discovery');
					} catch(err) {
						this.log('error', 'Error stopping Bluetooth discovery:', err);
					}
					btDiscoveryStarted = false;
				}

				if (_resolvePromise)
					_resolvePromise();
			};

			const miioListener = dev => {
				if (discoveryStopped)
					return;
				const id = (dev.id || '').toString();
				const model = dev.hostname?.replace(/_.*$/, '').replace(/-/g, '.');
				const device = {
					id, model,
					address: dev.address,
					token: dev.token || (id && this.config.devices?.find(d => d.id === id)?.token)
				};
				this.log('debug', 'MiIO device discovered:', device);
				if (!devices.some(d => d.address === device.address)) {
					devices.push(device);
					this.log('info', `MiIO device found: ${model || 'unknown model'} at ${device.address}`);
					if (findCallback && (findCallback(device, [...devices]) === true)) {
						this.log('info', 'Discovery stopped early by findCallback (MiIO device)');
						stopDiscoverySignal();
					}
				}
			};

			const btListener = async dev => {
				if (discoveryStopped)
					return;
				const device = {
					name: dev.name,
					mac: dev.mac
				};
				this.log('debug', 'Bluetooth device discovered:', device);
				if (!devices.some(d => d.mac === device.mac)) {
					if (!models)
						models = await Device.getModels();
					const devModels = await Device.findModels(dev, models);
					const devConfig = this.config.devices?.find(d => devModels?.includes(d.model) || d.name === device.name);
					device.token = devConfig?.token;
					device.model = devConfig?.model || devModels?.[0];
					devices.push(device);
					this.log('info', `Bluetooth device found: ${device.name} (${device.mac})`);
					if (findCallback && (findCallback(device, [...devices]) === true)) {
						this.log('info', 'Discovery stopped early by findCallback (MiIO device)');
						stopDiscoverySignal();
					}
				}
			};

			try {
				await new Promise(async resolve => {
					_resolvePromise = resolve;

					if (discoverMiio) {
						miioBrowser = this.miot.miio.browse();
						miioBrowser.on('available', miioListener);
						this.log('debug', 'Started MiIO discovery browser');
					}
					if (discoverBluetooth) {
						try {
							this.bluetooth.on('available', btListener);
							await this.bluetooth.startDiscovery(UUID);
							btDiscoveryStarted = true;
							this.log('debug', 'Started Bluetooth discovery');
						} catch (err) {
							this.log('error', 'Failed to start Bluetooth discovery:', err);
						}
					}

					if (discoverMiio || btDiscoveryStarted)
						discoveryTimer = setTimeout(stopDiscoverySignal, timeout);
					else{
						this.log('warn', 'No discovery method was successfully started.');
						stopDiscoverySignal();
					}
				});

			} catch (err) {
				this.log('error', 'Error during local discovery setup:', err);
				await stopDiscoverySignal();
			}
			this.log('info', `Local discovery finished. Found ${devices.length} devices total.`);
			return devices;
		}else{
			const msg = `Invalid config.connectionType specified: "${connectionType}". Allowed values are 'cloud', 'miio', 'bluetooth' or undefined.`;
			this.log('error', msg);
			throw new Error(msg);
		}
	};

	/**
	 * Создает и возвращает экземпляр класса Device для управления конкретным устройством.
	 * @param {object} device Конфигурация устройства.
	 * @returns {Promise<Device>} Promise, который разрешится экземпляром класса Device.
	 */
	async getDevice(device) {
		this.log('debug', 'Getting device instance for:', device);
		const key = Device.getDeviceId(device);
		if (this.#deviceInstances.has(key)) {
			const cachedInstance = this.#deviceInstances.get(key);
			if (cachedInstance.device && (cachedInstance.connectionType !== 'unknown')) {
				this.log('debug', `Returning cached device instance for: ${key}`);
				return this.#deviceInstances.get(key);
			}
			this.log('debug', `Cached instance ${key} found but seems disconnected. Removing from cache to allow recreation.`);
			this.#deviceInstances.delete(key);
		}
		const instance = await Device.create(device, this);
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
};
export { Device, Miot, Bluetooth };
export default XiaomiMiHome;
