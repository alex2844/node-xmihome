import EventEmitter from 'events';
import path from 'path';
import fs from 'fs/promises';
import miot from './miot.js';
import {
	NOTIFY_POLLING_INTERVAL, RECONNECT_INITIAL_DELAY, RECONNECT_MAX_DELAY,
	RECONNECT_FACTOR, RECONNECT_MAX_ATTEMPTS_SHORT, RECONNECT_MAX_ATTEMPTS_LONG
} from './constants.js';

/**
 * Базовый класс для управления устройствами Xiaomi.
 * @extends EventEmitter
 */
export class Device extends EventEmitter {
	/**
	 * Кэш для списка имен файлов моделей устройств.
	 * @static
	 * @private
	 * @type {string[] | null}
	 */
	static #models;

	/**
	 * Получает список доступных моделей устройств из директории `devices`.
	 * @static
	 * @async
	 * @returns {Promise<string[]>} Массив имен файлов моделей устройств.
	 */
	static async getModels() {
		if (!this.#models)
			try {
				this.#models = await fs.readdir(path.join(import.meta.dirname, 'devices'));
			} catch (err) {
				this.#models = [];
			}
		return this.#models;
	};

	/**
	 * Находит массив моделей (`static models`) из первого подходящего файла определения
	 * для переданного объекта устройства (`device`).
	 * @static
	 * @async
	 * @param {object} device Объект с данными обнаруженного устройства (должен иметь `name` или `model`).
	 * @param {string[]} [models] Предварительно загруженный список имен файлов моделей (опционально, для оптимизации).
	 * @returns {Promise<string[] | undefined>} Promise, который разрешится массивом `models` из найденного класса, или `undefined`, если подходящая модель не найдена.
	 */
	static async findModels(device, models) {
		if (!models)
			models = await this.getModels();
		for (const file of models) {
			const model = await this.loadModel(file);
			if (model?.valid(device, model))
				return model.models;
		}
	};

	/**
	 * Загружает класс модели устройства из файла.
	 * @static
	 * @async
	 * @param {string} file Имя файла модели (например, 'deerma.humidifier.jsq2w.mjs').
	 * @returns {Promise<typeof Device | undefined>} Promise, который разрешится классом модели или undefined в случае ошибки импорта.
	 * @throws Может выбросить ошибку, если файл не найден или содержит ошибки.
	 */
	static async loadModel(file) {
		const { default: model } = await import(path.join(import.meta.dirname, 'devices', file));
		return model;
	};

	/**
	 * Проверяет, соответствует ли переданное устройство (`device`)
	 * данному классу модели (`model`), используя `models` или `alias` класса.
	 * @static
	 * @param {object} device Объект с данными обнаруженного или создаваемого устройства (должен иметь `model` или `name`).
	 * @param {typeof Device} model Класс (конструктор) конкретной модели устройства для проверки.
	 * @returns {boolean} `true`, если устройство соответствует модели, `false` в противном случае.
	 */
	static valid(device, model) {
		return device.model ? model.models?.includes(device.model) : model.alias?.includes(device.name);
	};

	/**
	 * Генерирует уникальный строковый ключ для идентификации экземпляра устройства.
	 * Используется для кэширования экземпляров Device.
	 * Приоритет: D-Bus path (для BT), MAC-адрес, IP-адрес, ID облака, объект device.
	 * @static
	 * @param {object} device Объект конфигурации устройства.
	 * @returns {string} Строковый ключ для устройства.
	 */
	static getDeviceId(device) {
		return device.path?.split('/')?.pop() || device.mac || device.address || device.id || JSON.stringify(device);
	};

	/**
	 * Определяет предполагаемый тип подключения для устройства на основе его конфигурации.
	 * @static
	 * @param {object} device Объект конфигурации устройства (должен содержать id, address, token, mac, model).
	 * @param {object} [credentials] Объект с учетными данными (username, password) для проверки облачного подключения.
	 * @returns {'miio' | 'bluetooth' | 'cloud' | undefined} Определенный тип подключения или undefined, если не удалось определить.
	 */
	static getDeviceType(device, credentials) {
		if (device.address && device.token)
			return 'miio';
		if (device.mac && device.model)
			return 'bluetooth';
		if (device.id && credentials?.username && credentials?.password)
			return 'cloud';
	};

	/**
	 * Создает экземпляр класса Device или его подкласса в зависимости от модели устройства.
	 * Если модель устройства не найдена в локальных файлах, пытается загрузить спецификацию модели с miot-spec.org.
	 * @static
	 * @async
	 * @param {object} device Конфигурация устройства.
	 * @param {XiaomiMiHome} client Экземпляр класса XiaomiMiHome.
	 * @returns {Promise<Device>} Экземпляр класса Device или его подкласса.
	 * @throws {Error} Если устройство не найдено.
	 */
	static async create(device, client) {
		if (!device || (!device.name && !device.model)) {
			client?.log('error', 'Device.create failed: Device object is invalid or missing model/name.', device);
			throw new Error('Device not found');
		}
		client?.log('debug', `Device.create called for:`, device);
		const models = await this.getModels();
		if (device.model && (models.length > 0)) {
			const parts = device.model.split('.');
			models.sort((a, b) => {
				const aMatches = a.split('.').slice(0, -1).filter(part => parts.includes(part)).length;
				const bMatches = b.split('.').slice(0, -1).filter(part => parts.includes(part)).length;
				return bMatches - aMatches;
			});
		}
		for (const file of models) {
			const model = await this.loadModel(file);
			if (model?.valid(device, model)) {
				client?.log('info', `Using specific device class from "${file}" for model ${device.model || device.name}`);
				return new model(device, client);
			}
		}
		const spec = await miot.findModel(device.model).catch(() => {});
		if (spec) {
			client?.log('info', `Using generic MIoT spec definition for model ${device.model}`);
			client?.log('debug', `MIoT Spec details:`, spec);
			return new (class extends Device {
				static name = spec.name;
				static properties = spec.properties;
				static spec = `https://home.miot-spec.com/spec?type=${spec.type}`;
			})(device, client);
		}
		client?.log('info', `Using base Device class for model ${device.model || device.name}`);
		return new this(device, client);
	};

	/**
	 * Тип подключения устройства.
	 * Возможные значения:
	 * - `miio` - Подключение через протокол MiIO (токен + IP).
	 * - `bluetooth` - Подключение через Bluetooth (MAC-адрес + шаблон).
	 * - `cloud` - Подключение через облако Xiaomi (логин/пароль + ID устройства).
	 * - `unknown` - Подключение не установлено (по умолчанию).
	 * @type {'miio' | 'bluetooth' | 'cloud' | 'unknown'}
	 */
	connectionType = 'unknown'; 

	/**
	 * Флаг, указывающий, что устройство в данный момент подключено.
	 * @type {boolean}
	 */
	isConnected = false;

	/**
	 * Хранилище для активных и желаемых подписок на уведомления.
	 * Ключ - строковый идентификатор свойства (prop.key).
	 * Значение - объект, содержащий информацию о подписке:
	 *   {
	 *     prop: object, // Полное определение свойства (из this.properties или переданное)
	 *     callbacks: Function[], // Массив функций обратного вызова
	 *     characteristic: object | null, // Для Bluetooth: объект GATT-характеристики (обнуляется при дисконнекте)
	 *     timerId: NodeJS.Timeout | null, // Для Polling: идентификатор таймера (обнуляется при дисконнекте/остановке)
	 *   }
	 * @type {object<string, {prop: object, callbacks: Function[], characteristic?: object, timerId?: NodeJS.Timeout}>}
	 */
	notify = {};

	/**
	 * Промис, представляющий текущую активную операцию подключения.
	 * @private
	 * @type {Promise<void> | undefined}
	 */
	#connectionPromise;

	/**
	 * Контроллер для отмены текущей операции подключения.
	 * @private
	 * @type {AbortController | undefined}
	 */
	#connectionController;

	/**
	 * Промис, представляющий текущий активный процесс автоматического переподключения.
	 * @private
	 * @type {Promise<void> | undefined}
	 */
	#reconnectPromise;

	/**
	 * Контроллер для отмены текущего процесса автоматического переподключения.
	 * @private
	 * @type {AbortController | undefined}
	 */
	#reconnectController;

	/**
	 * Промис, представляющий текущую активную операцию отключения.
	 * @private
	 * @type {Promise<void> | undefined}
	 */
	#disconnectPromise;

	/**
	 * Конструктор класса Device.
	 * @param {object} config Конфигурация устройства.
	 * @param {string} [config.model] Модель устройства. Если не указана, будет попытаться определиться автоматически.
	 * @param {XiaomiMiHome} client Экземпляр класса XiaomiMiHome.
	 * @throws {Error} Если не удалось определить модель устройства.
	 */
	constructor(config, client) {
		super();
		this.client = client;
		this.config = config;
		this.client.log('debug', `Device instance ${this.constructor.name} created for config:`, config);
		if (!this.config.model) {
			this.config.model = this.getModel();
			if (!this.config.model)
				throw new Error('Model value not passed');
		}
		this.on('external_disconnect', this.#handleExternalDisconnect);
	};

	/**
	 * Получает модель устройства. Если модель не указана в конфигурации, пытается получить первую модель из списка `this.constructor.models`.
	 * @returns {string|undefined} Модель устройства или `undefined`, если не удалось определить.
	 */
	getModel() {
		return this.config && (this.config.model || this.constructor.models?.[0]);
	};

	/**
	 * Получает название модель устройства.
	 * @returns {string}
	 */
	getName() {
		return this.config.name || this.config.model || this.config.id;
	};

	/**
	 * Возвращает объект свойств устройства, определенных в `this.constructor.properties`.
	 * @type {object}
	 * @readonly
	 */
	get properties() {
		const properties = {};
		if (this.constructor.properties)
			for (const key in this.constructor.properties) {
				properties[key] = {
					...this.constructor.properties[key],
					key
				};
			}
		return properties;
	};

	/**
	 * Указывает, находится ли устройство в процессе первоначального подключения или смены типа подключения.
	 * @type {boolean}
	 * @readonly
	 */
	get isConnecting() {
		return !!this.#connectionController;
	};

	/**
	 * Указывает, находится ли устройство в процессе автоматического переподключения.
	 * @type {boolean}
	 * @readonly
	 */
	get isReconnecting() {
		return !!this.#reconnectController;
	};

	/**
	 * Выполняет специфичную для устройства логику аутентификации.
	 * @async
	 * @protected
	 */
	async auth() {};

	/**
	 * Устанавливает соединение с устройством.
	 * Тип подключения определяется в следующем порядке приоритета:
	 * 1. Явно переданный `connectionType` в метод.
	 * 2. Тип `connectionType`, указанный в основной конфигурации клиента (`client.config.connectionType`), если для него есть необходимые данные у устройства.
	 * 3. Автоматическое определение на основе доступных параметров конфигурации устройства (`address`/`token`, `mac`/`model`, `id`/`credentials`).
	 * @async
	 * @param {('miio' | 'bluetooth' | 'cloud')} [connectionType] Предпочитаемый тип подключения ('miio', 'bluetooth', 'cloud').
	 * @throws {Error} Если недостаточно данных для определения типа подключения или невозможно установить выбранный тип подключения.
	 */
	async connect(connectionType = this.client.config.connectionType) {
		if (this.isConnecting)
			return this.#connectionPromise;
		if (this.isConnected && this.device) {
			if (!connectionType || (connectionType === this.connectionType)) {
				this.client.log('warn', `Device "${this.getName()}" connection attempt ignored, already connected via ${this.connectionType}.`);
				return;
			}
			this.client.log('info', `Device "${this.getName()}" changing connection from ${this.connectionType} to ${connectionType}. Disconnecting first.`);
			await this.disconnect();
		}
		if (this.#connectionController)
			this.#connectionController.abort();
		this.#connectionController = new AbortController();
		this.#connectionPromise = (async () => {
			const signal = this.#connectionController.signal;
			try {
				if (signal.aborted)
					throw new Error('Connection cancelled');
				this.client.log('info', `Connecting to device "${this.getName()}" ${connectionType ? 'using specified type: ' + connectionType : '(auto-detecting type)'}`);
				if (!connectionType) {
					connectionType = this.constructor.getDeviceType(this.config, this.client.config.credentials);
					if (!connectionType)
						throw new Error('Недостаточно данных для определения типа подключения');
				}else{
					if (
						(connectionType === 'miio' && !(this.config.address && this.config.token)) ||
						(connectionType === 'bluetooth' && !(this.config.mac && this.config.model)) ||
						(connectionType === 'cloud' && !(this.config.id && this.client.config.credentials?.username && this.client.config.credentials?.password))
					)
						throw new Error(`Невозможно установить тип подключения: ${connectionType}`);
				}
				if (signal.aborted)
					throw new Error('Connection cancelled');
				this.client.log('debug', `Attempting connection via ${connectionType}`);
				if (connectionType === 'miio') {
					this.client.log('debug', `Connecting via MiIO to ${this.config.address}`);
					this.device = await Promise.race([
						this.client.miot.miio.device({
							address: this.config.address,
							token: this.config.token
						}),
						new Promise((_, reject) => {
							signal.addEventListener('abort', () => reject(new Error('Connection cancelled')));
						})
					]);
				}else if (connectionType === 'bluetooth') {
					this.client.log('debug', `Connecting via Bluetooth to ${this.config.mac}`);
					const device = await this.client.bluetooth.getDevice(this.config.mac);
					this.proxy = device['$object'];
					let retries = 3;
					while (true) {
						if (signal.aborted)
							throw new Error('Connection cancelled');
						await this.#sleep(500, signal);
						try {
							await Promise.race([
								device.connect(),
								new Promise((_, reject) => {
									signal.addEventListener('abort', () => reject(new Error('Connection cancelled')));
								})
							]);
							break;
						} catch (err) {
							if (signal.aborted || (--retries === 0))
								throw err;
							await this.#sleep(1000, signal);
						}
					}
					const id = this.constructor.getDeviceId(this.proxy);
					this.device = device;
					this.client.bluetooth.connected[id] = this;
				}else if (connectionType === 'cloud') {
					this.client.log('debug', `Connection type set to 'cloud' for device ${this.config.id}. Ready for requests.`);
					this.device = {
						id: this.config.id
					};
				}
				if (signal.aborted)
					throw new Error('Connection cancelled');
				this.connectionType = connectionType;
				try {
					await this.auth();
				} catch (err) {
					this.client.log('error', `Authentication failed:`, err);
					try {
						await this.disconnect();
					} catch (err) {}
					throw err;
				}
				this.isConnected = true;
				this.client.log('info', `Device "${this.getName()}" connected via: ${this.connectionType}`);
				this.emit('connected', this.connectionType);
			} catch (err) {
				if (signal.aborted)
					this.client.log('info', `Connection to device "${this.getName()}" was cancelled`);
				else
					this.client.log('error', `Failed to connect to device "${this.getName()}" via ${connectionType}:`, err);
				this.connectionType = 'unknown';
				this.device = null;
				this.proxy = null;
				this.isConnected = false;
				throw err;
			} finally {
				this.#connectionPromise = null;
				this.#connectionController = null;
			}
		})();
		return this.#connectionPromise;
	};

	/**
	 * Разрывает соединение с устройством.
	 * @async
	 */
	async disconnect() {
		if (this.#disconnectPromise) {
			this.client.log('debug', `Device "${this.getName()}" disconnect already in progress. Returning existing promise.`);
			return this.#disconnectPromise;
		}
		this.#disconnectPromise = (async () => {
			try {
				if (this.isConnecting) {
					this.client.log('info', `Cancelling connection to device "${this.getName()}"`);
					this.#connectionController.abort();
					await this.#connectionPromise.catch(() => {});
				}
				if (this.isReconnecting) {
					this.client.log('info', `Cancelling reconnection process for device "${this.getName()}"`);
					this.#reconnectController.abort();
					await this.#reconnectPromise.catch(() => {});
				}
				if (!this.device || !this.isConnected) {
					this.client.log('warn', `Device "${this.getName()}" disconnect attempt ignored, not connected.`);
					return;
				}
				this.isConnected = false;
				this.client.log('info', `Disconnecting from device "${this.getName()}" (type: ${this.connectionType})`);
				for (const key in this.notify) {
					this.client.log('debug', `Stopping notifications for ${key} during disconnect.`);
					await this.stopNotify(key).catch(err => this.client.log('warn', `Error stopping notify for ${key} during disconnect:`, err));
				}
				this.notify = {};
				if (this.connectionType === 'miio')
					await this.device.destroy();
				else if (this.connectionType === 'bluetooth') {
					const id = this.constructor.getDeviceId(this.proxy);
					await this.device.Disconnect();
					delete this.client.bluetooth.connected[id];
				}
				this.client.log('debug', `Device "${this.getName()}" disconnected successfully.`);
			} catch (err) {
				this.client.log('error', `Error during disconnection from "${this.getName()}":`, err);
				throw err;
			} finally {
				this.device = null;
				this.proxy = null;
				this.connectionType = 'unknown';
				this.emit('disconnect');
				this.#disconnectPromise = null;
			}
		})();
		return this.#disconnectPromise;
	};

	/**
	 * Получает значения свойств устройства.
	 * Если `properties` не указан, запрашивает значения всех доступных для чтения свойств.
	 * @async
	 * @param {string[]|object[]} [properties] Массив ключей свойств или объектов свойств для запроса.
	 * @returns {Promise<object>} Объект, где ключи - это ключи свойств, а значения - их значения.
	 */
	async getProperties(properties) {
		let result = {};
		if (!properties)
			properties = Object.values(this.properties).filter(prop => prop.access?.includes('read') || prop.read);
		if (properties.length) {
			if (this.connectionType === 'bluetooth')
				for (var prop of properties) {
					result[prop.key] = await this.getProperty(prop);
				}
			else
				for (var prop of await this.getProperty(properties)) {
					if (!prop.code) {
						const key = properties.find(({ siid, piid }) => ((siid === prop.siid) && (piid === prop.piid)))?.key || `${prop.siid}/${prop.piid}`;
						result[key] = prop.value;
					}
				}
		}
		return result;
	};

	/**
	 * Получает значение конкретного свойства устройства.
	 * @async
	 * @param {string|object} prop Ключ свойства или объект свойства.
	 * @returns {Promise<*>} Значение свойства.
	 */
	async getProperty(prop) {
		let result;
		if (prop.constructor === String)
			prop = this.properties[prop];
		this.client.log('debug', `Getting property for "${this.getName()}" via ${this.connectionType}`, prop);
		if (this.connectionType === 'bluetooth')
			result = prop.read(await (await this.device.getCharacteristic(prop)).readValue());
		else{
			const params = [].concat(prop).map(({ siid, piid }) => ({ siid, piid }));
			if (this.connectionType === 'miio')
				result = await this.device.call('get_properties', params);
			else if (this.connectionType === 'cloud')
				result = await this.client.miot.request(`/home/rpc/${this.config.id}`, {
					params, method: 'get_properties'
				}).then(({ result }) => result);
			if (result && (prop.constructor === Object))
				result = result[0].value;
		}
		this.client.log('debug', `Got property value:`, result);
		return result;
	};

	/**
	 * Устанавливает значение свойства устройства.
	 * @async
	 * @param {string|object} prop Ключ свойства или объект свойства.
	 * @param {*} value Значение для установки.
	 * @throws {Error} Если свойство не поддерживает запись.
	 */
	async setProperty(prop, value) {
		if (prop.constructor === String)
			prop = this.properties[prop];
		this.client.log('debug', `Setting property for "${this.getName()}" via ${this.connectionType}`, prop, value);
		try {
			if (!prop.access?.includes('write') && !prop.write)
				throw new Error('The property does not support write');
			if (this.connectionType === 'bluetooth')
				await (await this.device.getCharacteristic(prop)).writeValue(prop.write(value));
			else{
				if (this.connectionType === 'miio')
					await this.device.call('set_properties', [{
						siid: prop.siid,
						piid: prop.piid,
						value
					}]);
				else if (this.connectionType === 'cloud')
					await this.client.miot.request(`/home/rpc/${this.config.id}`, {
						method: 'set_properties',
						params: [{
							siid: prop.siid,
							piid: prop.piid,
							value
						}]
					});
			}
			this.client.log('info', `Property set to '${value}' successfully for "${this.getName()}"`);
		} catch (err) {
			this.client.log('error', `Failed to set property for "${this.getName()}":`, err);
			throw err;
		}
	};

	/**
	 * Начинает прослушивание уведомлений об изменении значения свойства.
	 * @async
	 * @param {string|object} prop Ключ свойства или объект свойства.
	 * @param {function} callback Функция обратного вызова, вызываемая при изменении значения свойства.
	 * @throws {Error} Если свойство не поддерживает уведомления.
	 */
	async startNotify(prop, callback) {
		let lastValue = null;
		if (prop.constructor === String)
			prop = this.properties[prop];
		this.client.log('info', `Starting notifications for property '${prop.key}' on ${this.getName()}`);
		if (!prop.access?.includes('notify') && !prop.notify)
			throw new Error('The property does not support notifications');
		if (!this.notify[prop.key])
			this.notify[prop.key] = {
				prop,
				callbacks: [],
				characteristic: null,
				timerId: null
			};
		this.notify[prop.key].callbacks.push(callback);
		if (this.connectionType === 'bluetooth') {
			if (!this.notify[prop.key].characteristic) {
				this.notify[prop.key].characteristic = await this.device.getCharacteristic(prop);
				await this.notify[prop.key].characteristic.startNotifications();
			}
			this.notify[prop.key].characteristic.on('valuechanged', buf => {
				const value = (prop.notify || prop.read)(buf);
				const str = JSON.stringify(value)
				this.client.log('debug', `Received BT notification for '${prop.key}': raw=${buf?.toString('hex')}, parsed=${str}`);
				if (str !== lastValue) {
					lastValue = str;
					callback(value);
				}
			});
		}else{
			if (!this.notify[prop.key].timerId) {
				const poll = async () => {
					try {
						const value = await this.getProperty(prop);
						const str = JSON.stringify(value)
						this.client.log('debug', `Polling property '${prop.key}': parsed=${str}`);
						if (str !== lastValue) {
							lastValue = str;
							this.notify[prop.key].callbacks.forEach(cb => cb(value));
						}
					} catch (err) {
						this.client.log('error', `Error during polling for property '${prop.key}' on device "${this.getName()}":`, err);
					}
					this.notify[prop.key].timerId = setTimeout(poll, NOTIFY_POLLING_INTERVAL);
				};
				await poll();
			}else if (lastValue)
				callback(lastValue);
		}
	};

	/**
	 * Останавливает прослушивание уведомлений об изменении значения свойства.
	 * @async
	 * @param {string|object} prop Ключ свойства или объект свойства.
	 */
	async stopNotify(prop) {
		if (prop.constructor === String)
			prop = this.properties[prop];
		this.client.log('info', `Stopping notifications for property '${prop.key}' on "${this.getName()}"`);
		if (this.notify[prop.key]) {
			if (this.connectionType === 'bluetooth') {
				if (this.client.bluetooth.bus && this.notify[prop.key].characteristic) {
					this.notify[prop.key].characteristic.removeAllListeners('valuechanged');
					try {
						await this.notify[prop.key].characteristic.stopNotifications();
					} catch (err) {
						this.client.log('warn', `Error during StopNotify for ${prop.key} (bus may be closing):`, err);
					}
				}
			}else if (this.notify[prop.key].timerId)
				clearTimeout(this.notify[prop.key].timerId);
			delete this.notify[prop.key];
		}
		this.client.log('debug', `Notifications stopped successfully for '${prop.key}'`);
	};

	/**
	 * Обрабатывает ситуацию, когда соединение с устройством было разорвано извне
	 * (например, по сигналу от D-Bus для Bluetooth или при ошибке сети для MiIO/Cloud).
	 * Очищает состояние устройства и, если были активные подписки,
	 * пытается автоматически переподключиться.
	 * @private
	 * @async
	 * @param {string} reason Причина внешнего дисконнекта.
	 */
	async #handleExternalDisconnect(reason) {
		if (!this.isConnected || this.isConnecting) {
			this.client.log('debug', `Device "${this.getName()}" #handleExternalDisconnect skipped: not connected, no device, or already reconnecting.`);
			return;
		}
		if (this.#reconnectController)
			this.#reconnectController.abort();
		this.client.log('warn', `Device "${this.getName()}" was externally disconnected. Reason: ${reason}.`);
		const connectionType = this.connectionType;
		const notify = [];
		for (const key in this.notify) {
			for (const callback of this.notify[key].callbacks) {
				notify.push({
					callback,
					prop: this.notify[key].prop
				});
			}
		}
		await this.disconnect();
		this.emit('reconnecting', { reason });
		this.#reconnectController = new AbortController();
		this.#reconnectPromise = (async () => {
			const signal = this.#reconnectController.signal;
			try {
				if (signal.aborted)
					throw new Error('Connection cancelled');
				let currentAttempt = 0;
				let currentDelay = RECONNECT_INITIAL_DELAY;
				while (!signal.aborted && !this.isConnected) {
					currentAttempt++;
					const isShortAttemptPhase = currentAttempt <= RECONNECT_MAX_ATTEMPTS_SHORT;
					const maxAttemptsInPhase = isShortAttemptPhase ? RECONNECT_MAX_ATTEMPTS_SHORT : RECONNECT_MAX_ATTEMPTS_SHORT + RECONNECT_MAX_ATTEMPTS_LONG;
					if (currentAttempt > maxAttemptsInPhase) {
						this.client.log('error', `All ${maxAttemptsInPhase} reconnect attempts failed for "${this.getName()}". Automatic reconnection for this event stopped. Next operation will attempt to connect.`);
						this.emit('reconnect_failed', { attempts: maxAttemptsInPhase });
						break;
					}
					try {
						this.client.log('info', `Reconnect attempt ${currentAttempt}/${maxAttemptsInPhase} for "${this.getName()}" (phase: ${isShortAttemptPhase ? 'short' : 'long'}) using type ${connectionType}.`);
						if (signal.aborted)
							throw new Error('Reconnection cancelled');
						await this.connect(connectionType);
						this.client.log('info', `Device "${this.getName()}" reconnected successfully on attempt ${currentAttempt}.`);
					} catch (err) {
						if (signal.aborted)
							throw new Error('Reconnection cancelled');
						if (isShortAttemptPhase && (currentAttempt === RECONNECT_MAX_ATTEMPTS_SHORT) && (RECONNECT_MAX_ATTEMPTS_LONG > 0)) {
							this.client.log('info', `Switching to long reconnect attempts for "${this.getName()}"`);
							currentDelay = RECONNECT_MAX_DELAY;
						}else if (currentAttempt > 1)
							currentDelay = Math.min(Math.floor(currentDelay * RECONNECT_FACTOR), RECONNECT_MAX_DELAY);
						this.client.log('debug', `Waiting ${currentDelay / 1_000}s before next reconnect attempt for "${this.getName()}".`);
						await this.#sleep(currentDelay, signal);
					}
				}
				if (this.isConnected && (notify.length > 0)) {
					if (signal.aborted)
						throw new Error('Reconnection cancelled');
					this.client.log('info', `Restoring ${notify.length} subscriptions for "${this.getName()}" after successful reconnect.`);
					for (const { prop, callback } of notify) {
						if (signal.aborted)
							throw new Error('Reconnection cancelled');
						await this.startNotify(prop, callback);
					}
				}
			} catch (err) {
				if (!signal.aborted)
					this.client.log('error', `Reconnection process failed for "${this.getName()}":`, err);
				this.emit('reconnect_failed', { error: err.message });
				throw err;
			} finally {
				this.#reconnectPromise = null;
				this.#reconnectController = null;
			}
		})();
		return this.#reconnectPromise;
	};

	/**
	 * Приостанавливает выполнение на указанное количество миллисекунд.
	 * Этот метод можно прервать с помощью переданного AbortSignal.
	 * @private
	 * @async
	 * @param {number} ms Количество миллисекунд для ожидания.
	 * @param {AbortSignal} [signal] Опциональный AbortSignal для отмены ожидания.
	 * @returns {Promise<void>} Promise, который разрешается после указанной задержки.
	 * @throws {Error} Если ожидание было отменено сигналом.
	 */
	#sleep(ms, signal = undefined) {
		return new Promise((resolve, reject) => {
			const timerId = setTimeout(resolve, ms);
			if (signal) {
				const abortHandler = () => {
					clearTimeout(timerId);
					reject(new Error('Operation cancelled'));
				};
				signal.addEventListener('abort', abortHandler);
				setTimeout(() => signal.removeEventListener('abort', abortHandler), ms);
			}
		});
	};
};
export default Device;
