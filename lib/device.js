import EventEmitter from 'events';
import path from 'path';
import fs from 'fs/promises';
import miot from './miot.js';

// Константа для директории с моделями
const DEVICES_DIR = path.join(import.meta.dirname, 'devices');

/**
 * Базовый класс для управления устройствами Xiaomi.
 * @extends EventEmitter
 */
export class Device extends EventEmitter {
	/**
	 * Получает список доступных моделей устройств из директории `devices`.
	 * @static
	 * @async
	 * @returns {Promise<string[]>} Массив имен файлов моделей устройств.
	 */
	static async getModels() {
		try {
			return await fs.readdir(DEVICES_DIR);
		} catch (error) {}
		return [];
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
		const { default: model } = await import(path.join(DEVICES_DIR, file));
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
	static valid(device=this.device, model=this) {
		return device.model ? model.models?.includes(device.model) : model.alias?.includes(device.name);
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
		this.device = device;
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
			if (model?.valid()) {
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
	 * Устанавливает соединение с устройством.
	 * Тип подключения определяется в следующем порядке приоритета:
	 * 1. Явно переданный `connectionType` в метод.
	 * 2. Тип `connectionType`, указанный в основной конфигурации клиента (`client.config.connectionType`), если для него есть необходимые данные у устройства.
	 * 3. Автоматическое определение на основе доступных параметров конфигурации устройства (`address`/`token`, `mac`/`model`, `id`/`credentials`).
	 * @async
	 * @param {('miio' | 'bluetooth' | 'cloud')} [connectionTypeInput] Предпочитаемый тип подключения ('miio', 'bluetooth', 'cloud').
	 * @throws {Error} Если недостаточно данных для определения типа подключения или невозможно установить выбранный тип подключения.
	 */
	async connect(connectionType=this.client.config.connectionType) {
		if (this.device) {
			this.client.log('warn', `Device "${this.getName()}" connection attempt ignored, already connected.`);
			return;
		}
		this.client.log('info', `Connecting to device "${this.getName()}" ${connectionType ? 'using specified type: ' + connectionType : '(auto-detecting type)'}`);
		if (!connectionType) {
			if (this.config.address && this.config.token)
				connectionType = 'miio';
			else if (this.config.mac && this.config.model)
				connectionType = 'bluetooth';
			else if (this.config.id && this.client.config.credentials?.username && this.client.config.credentials?.password)
				connectionType = 'cloud';
			else
				throw new Error('Недостаточно данных для определения типа подключения');
		}else{
			if (
				(connectionType === 'miio' && !(this.config.address && this.config.token)) ||
				(connectionType === 'bluetooth' && !(this.config.mac && this.config.model)) ||
				(connectionType === 'cloud' && !(this.config.id && this.client.config.credentials?.username && this.client.config.credentials?.password))
			)
				throw new Error(`Невозможно установить тип подключения: ${connectionType}`);
		}
		this.client.log('debug', `Attempting connection via ${connectionType}`);
		try {
			if (connectionType === 'miio') {
				this.client.log('debug', `Connecting via MiIO to ${this.config.address}`);
				this.device = await this.client.miot.miio.device({
					address: this.config.address,
					token: this.config.token
				});
			}else if (connectionType === 'bluetooth') {
				this.client.log('debug', `Connecting via Bluetooth to ${this.config.mac}`);
				const device = await this.client.bluetooth.getDevice(this.config.mac);
				this.proxy = device['$object'];
				let retries = 3;
				while (true) {
					await new Promise(resolve => setTimeout(resolve));
					try {
						await device.Connect();
						break;
					} catch (err) {
						if (--retries === 0)
							throw err;
						await new Promise(resolve => setTimeout(resolve, 1000));
					}
				}
				this.client.log('debug', `Bluetooth device ${this.config.mac} connected, resolving services...`);
				const properties = this.proxy.getInterface('org.freedesktop.DBus.Properties');
				while (true) {
					await new Promise(resolve => setTimeout(resolve));
					const servicesResolved = await properties.Get('org.bluez.Device1', 'ServicesResolved');
					if (servicesResolved.value)
						break;
				}
				this.client.log('debug', `Bluetooth services resolved for ${this.config.mac}`);
				const id = this.proxy.path.split('/').pop();
				this.device = device;
				this.client.bluetooth.connected[id] = this;
			}else if (connectionType === 'cloud') {
				this.client.log('debug', `Connection type set to 'cloud' for device ${this.config.id}. Ready for requests.`);
				this.device = {
					id: this.config.id
				};
			}
			this.notify = {};
			this.connectionType = connectionType;
			this.client.log('info', `Device "${this.getName()}" connected via: ${this.connectionType}`);
		} catch (error) {
			this.client.log('error', `Failed to connect to device "${this.getName()}" via ${connectionType}:`, error);
			this.connectionType = 'unknown';
			this.device = null;
			throw error;
		}
	};

	/**
	 * Разрывает соединение с устройством.
	 * @async
	 */
	async disconnect() {
		if (!this.device) {
			this.client.log('warn', `Device "${this.getName()}" disconnect attempt ignored, not connected.`);
			return;
		}
		this.client.log('info', `Disconnecting from device "${this.getName()}" (type: ${this.connectionType})`);
		try {
			if (this.connectionType === 'miio')
				await this.device.destroy();
			else if (this.connectionType === 'bluetooth') {
				const id = this.proxy.path.split('/').pop();
				await this.device.Disconnect();
				delete this.client.bluetooth.connected[id];
			}
			this.client.log('debug', `Device "${this.getName()}" disconnected successfully.`);
		} catch (error) {
			this.client.log('error', `Error during disconnection from "${this.getName()}":`, error);
		} finally {
			for (const key in this.notify) {
				this.client.log('debug', `Stopping notifications for ${key} during disconnect.`);
				await this.stopNotify(key).catch(err => this.client.log('warn', `Error stopping notify for ${key} during disconnect:`, err));
			}
			this.device = null;
			this.connectionType = 'unknown';
		}
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
		} catch (error) {
			this.client.log('error', `Failed to set property for "${this.getName()}":`, error);
			throw error;
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
		if (this.connectionType === 'bluetooth') {
			if (!this.notify[prop.key]) {
				this.notify[prop.key] = await this.device.getCharacteristic(prop);
				await this.notify[prop.key].startNotifications();
			}
			this.notify[prop.key].on('valuechanged', buf => {
				const value = (prop.notify || prop.read)(buf);
				const str = JSON.stringify(value)
				this.client.log('debug', `Received BT notification for '${prop.key}': raw=${buf?.toString('hex')}, parsed=${str}`);
				if (str !== lastValue) {
					lastValue = str;
					callback(value);
				}
			});
		}else{
			if (!this.notify[prop.key])
				this.notify[prop.key] = {
					callbacks: [],
					timerId: null
				};
			this.notify[prop.key].callbacks.push(callback);
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
					} catch (error) {
						this.client.log('error', `Error during polling for property '${prop.key}' on device "${this.getName()}":`, error);
					}
					this.notify[prop.key].timerId = setTimeout(poll, 5000);
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
				await this.notify[prop.key].stopNotifications();
				this.notify[prop.key].removeAllListeners('valuechanged');
			}else if (this.notify[prop.key].timerId)
				clearTimeout(this.notify[prop.key].timerId);
			delete this.notify[prop.key];
		}
		this.client.log('debug', `Notifications stopped successfully for '${prop.key}'`);
	};
};
export default Device;
