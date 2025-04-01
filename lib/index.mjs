import util from 'util';
import EventEmitter from 'events';
import Device from './device.mjs';
import Miot from './miot.mjs';
import Bluetooth from './bluetooth.mjs';

// Определим уровни логирования
const LOG_LEVELS = {
	none: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4
};
const DEFAULT_LOG_LEVEL = 'none';
const LIB_ID = 'xmihome';

/**
 * Класс для взаимодействия с устройствами Xiaomi Mi Home.
 * @extends EventEmitter
 */
export class XiaomiMiHome extends EventEmitter {
	/**
	 * UUID для Bluetooth LE устройств Xiaomi.
	 * @type {string[]}
	 */
	UUID = [ '0000fe95-0000-1000-8000-00805f9b34fb' ];

	/**
	 * Экземпляр debuglog для вывода отладочной информации при NODE_DEBUG=xmihome.
	 * @private
	 */
	_debugLog;

	/**
	 * Флаг, указывающий, включен ли вывод через NODE_DEBUG=xmihome.
	 * @private
	 * @type {boolean}
	 */
	_isDebugEnvEnabled = false;

	/**
	 * Числовой уровень логирования, установленный через конструктор.
	 * @private
	 * @type {number}
	 */
	_logLevelNumber = LOG_LEVELS[DEFAULT_LOG_LEVEL];

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
	constructor(config) {
		super();
		this.config = config;
		this._debugLog = util.debuglog(LIB_ID);
		this._isDebugEnvEnabled = process.env.NODE_DEBUG && new RegExp(`\\b${LIB_ID}\\b`, 'i').test(process.env.NODE_DEBUG);
		this._logLevelNumber = LOG_LEVELS[config?.logLevel] || LOG_LEVELS[DEFAULT_LOG_LEVEL];
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
		this._debugLog(prefix, ...args.map(arg => typeof arg === 'object' ? util.inspect(arg, { depth: null }) : arg));
		if (!this._isDebugEnvEnabled && (LOG_LEVELS[level] <= this._logLevelNumber))
			console[level](`[${LIB_ID}]`, prefix, ...args);
	}

	/**
	 * Возвращает экземпляр класса Miot для взаимодействия через MiIO и облако.
	 * @type {Miot}
	 * @readonly
	 */
	get miot() {
		if (!this._miot) {
			this._miot = new Miot(this);
			this.log('debug', 'Creating Miot instance');
		}
		return this._miot;
	};

	/**
	 * Возвращает экземпляр класса Bluetooth для взаимодействия через Bluetooth LE.
	 * @type {Bluetooth}
	 * @readonly
	 */
	get bluetooth() {
		if (!this._bluetooth)
			this._bluetooth = new Bluetooth(this);
		return this._bluetooth;
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
		} catch (error) {
			this.log('error', 'Failed to get home list:', error);
			throw error;
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
		} catch (error) {
			this.log('error', `Failed to get env data for home_id ${home_id}:`, error);
			throw error;
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
	 * Получает список устройств, доступных в сети (MiIO и Bluetooth).
	 * Если указаны учетные данные, получает список устройств из облака Xiaomi.
	 * В противном случае выполняет поиск устройств в локальной сети и Bluetooth.
	 * @async
	 * @param {number} [timeout=10000] Время ожидания поиска Bluetooth устройств в миллисекундах.
	 * @returns {Promise<Array<object>>} Массив объектов устройств.
	 */
	async getDevices(timeout=10000) {
		// TODO: Отказаться от tokens, вместо него список сохранять в credentials
		// TODO: Проверять передан ли this.config.connectionType
		if (this.config.credentials?.username && this.config.credentials?.password) {
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
			} catch (error) {
				this.log('error', 'Failed to get device list from cloud:', error);
				throw error;
			}
		}else{
			this.log('info', `Starting local network discovery (MiIO + Bluetooth) for ${timeout}ms`);
			const devices = [];
			const browser = this.miot.miio.browse();
			browser.on('available', device => {
				const id = (device.id || '').toString();
				devices.push({
					id,
					address: device.address,
					token: device.token || (id && this.config.devices?.find(device => device.id === id)?.token),
					model: device.hostname?.replace(new RegExp('_.*'), '').replace(new RegExp('-', 'g'), '.')
				});
			});
			this.bluetooth.on('available', device => {
				devices.push({
					name: device.name,
					mac: device.mac
				});
			});
			await this.bluetooth.startDiscovery(this.UUID);
			return new Promise(resolve => setTimeout(() => {
				this.bluetooth.stopDiscovery();
				browser.stop();
				resolve(devices);
			}, timeout));
		}
	};
	async getDevices(timeout=10000) {
		if (this.config.credentials?.username && this.config.credentials?.password) {
			this.log('info', 'Fetching device list from Xiaomi Cloud'); // <-- INFO
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
			} catch (error) {
				this.log('error', 'Failed to get device list from cloud:', error);
				throw error;
			}
		} else {
			this.log('info', `Starting local network discovery (MiIO + Bluetooth) for ${timeout}ms`);
			const devices = [];
			let miioBrowser;
			let btDiscoveryStarted = false;

			const miioListener = device => {
				const id = (device.id || '').toString();
				const model = device.hostname?.replace(/_.*$/, '').replace(/-/g, '.');
				const devData = {
					id, model,
					address: device.address,
					token: device.token || (id && this.config.devices?.find(d => d.id === id)?.token)
				};
				this.log('debug', 'MiIO device discovered:', devData);
				if (!devices.some(d => d.address === devData.address)) {
					devices.push(devData);
					this.log('info', `MiIO device found: ${model || 'unknown model'} at ${devData.address}`);
				}
			};

			const btListener = device => {
				const devData = {
					name: device.name,
					mac: device.mac,
				};
				this.log('debug', 'Bluetooth device discovered:', devData);
				if (!devices.some(d => d.mac === devData.mac)) {
					devices.push(devData);
					this.log('info', `Bluetooth device found: ${devData.name} (${devData.mac})`);
				}
			};

			try {
				miioBrowser = this.miot.miio.browse();
				miioBrowser.on('available', miioListener);
				this.log('debug', 'Started MiIO discovery browser');

				this.bluetooth.on('available', btListener);
				await this.bluetooth.startDiscovery(this.UUID);
				btDiscoveryStarted = true;
				this.log('debug', 'Started Bluetooth discovery');

				await new Promise(resolve => setTimeout(resolve, timeout));

			} catch (error) {
				this.log('error', 'Error during local discovery:', error);
			} finally {
				if (miioBrowser) {
					miioBrowser.off('available', miioListener);
					miioBrowser.stop();
					this.log('debug', 'Stopped MiIO discovery browser');
				}
				if (btDiscoveryStarted) {
					this.bluetooth.off('available', btListener);
					try {
						await this.bluetooth.stopDiscovery();
						this.log('debug', 'Stopped Bluetooth discovery');
					} catch(stopError) {
						this.log('error', 'Error stopping Bluetooth discovery:', stopError);
					}
				}
				this.log('info', `Local discovery finished. Found ${devices.length} devices total.`);
			}
			return devices;
		}
	};

	/**
	 * Создает и возвращает экземпляр класса Device для управления конкретным устройством.
	 * @param {object} device Конфигурация устройства.
	 * @returns {Promise<Device>} Promise, который разрешится экземпляром класса Device.
	 */
	getDevice(device) {
		this.log('debug', 'Getting device instance for:', device);
		return Device.create(device, this);
	};
};
export default XiaomiMiHome;
