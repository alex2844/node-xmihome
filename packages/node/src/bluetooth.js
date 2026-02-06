import EventEmitter from 'events';
import MiBeacon from './mibeacon.js';
import { UUID, GET_DEVICE_DISCOVERY_TIMEOUT } from './constants.js';
import { createFallbackProxy } from './index.js';
/** @import { XiaomiMiHome } from './index.js' */
/** @import { default as Device, Config as DeviceConfig } from './device.js' */

/**
 * Класс-обертка для GATT-характеристики.
 */
export class BluetoothCharacteristic {
	/**
	 * @param {import('dbus-next').ClientInterface} dbusInterface - Интерфейс org.bluez.GattCharacteristic1
	 */
	constructor(dbusInterface) {
		this.dbusInterface = dbusInterface;
	};

	/**
	 * Включает уведомления для этой характеристики.
	 */
	async startNotifications() {
		return this.dbusInterface.StartNotify();
	};

	/**
	 * Отключает уведомления для этой характеристики.
	 */
	async stopNotifications() {
		return this.dbusInterface.StopNotify();
	};

	/**
	 * Читает значение характеристики.
	 * @returns {Promise<Buffer>} Промис, который разрешится буфером со значением.
	 */
	async readValue() {
		return this.dbusInterface.ReadValue({});
	};

	/**
	 * Записывает значение в характеристику.
	 * @param {Buffer} buffer - Буфер данных для записи.
	 */
	async writeValue(buffer) {
		return this.dbusInterface.WriteValue(buffer, {});
	};
};

/**
 * Класс-обертка для Bluetooth-устройства.
 */
export class BluetoothDevice {
	/**
	 * @typedef {Object<string, {
	 *   path: string,
	 *   characteristics: Object<string, {path: string, flags: string[]}>
	 * }>} GattProfile
	 */

	/** @type {GattProfile|null} */
	gattProfile = null;

	/**
	 * @param {import('dbus-next').ClientInterface} dbusInterface - Интерфейс org.bluez.Device1
	 * @param {import('dbus-next').ProxyObject} proxy - Прокси-объект устройства
	 * @param {Bluetooth} bluetooth - Экземпляр класса Bluetooth.
	 */
	constructor(dbusInterface, proxy, bluetooth) {
		this.dbusInterface = dbusInterface;
		this.proxy = proxy;
		this.bluetooth = bluetooth;
		this.client = bluetooth.client;
		this.objectManager = null;
		this.characteristics = new Map();
	};

	/**
	 * Возвращает уникальный идентификатор устройства в формате D-Bus (dev_XX_XX_XX_...).
	 * Этот ID извлекается из пути D-Bus объекта.
	 * @type {string}
	 */
	get id() {
		return this.proxy.path.split('/').pop();
	};

	/**
	 * Устанавливает соединение с устройством.
	 * @returns {Promise<void>}
	 */
	async connect() {
		const sec = process.env.DBUS_SYSTEM_BUS_ADDRESS ? 30 : 10;
		const properties = this.proxy.getInterface('org.freedesktop.DBus.Properties');
		const checkResolved = async () => {
			try {
				const { value } = await properties.Get('org.bluez.Device1', 'ServicesResolved');
				return value;
			} catch {
				return false;
			}
		};
		if (await checkResolved())
			return;
		return new Promise(async (resolve, reject) => {
			let timerId;
			const onPropertiesChanged = (/** @type {any} */ changedProps) => {
				if (changedProps.ServicesResolved) {
					cleanup();
					return resolve();
				}
			};
			const cleanup = () => {
				clearTimeout(timerId);
				this.bluetooth.off(`properties:${this.id}`, onPropertiesChanged);
			};
			timerId = setTimeout(() => {
				cleanup();
				reject(new Error(`Timed out after ${sec}s waiting for services to be resolved.`));
			}, sec * 1000);
			this.bluetooth.on(`properties:${this.id}`, onPropertiesChanged);
			try {
				await this.dbusInterface.Connect();
				if (await checkResolved()) {
					cleanup();
					return resolve();
				}
			} catch (err) {
				if (err.type === 'org.bluez.Error.InProgress' || err.type === 'org.bluez.Error.AlreadyConnected') {
					if (await checkResolved()) {
						cleanup();
						return resolve();
					}
				} else {
					cleanup();
					return reject(err);
				}
			}
		});
	};

	/**
	 * Разрывает соединение с устройством.
	 * @returns {Promise<void>}
	 */
	async disconnect() {
		return this.dbusInterface.Disconnect();
	};

	/**
	 * Получает и кэширует экземпляр обертки для GATT-характеристики.
	 * Метод является универсальным и поддерживает два режима работы:
	 * 1. Поиск по UUID: передайте { service: 'uuid', characteristic: 'uuid' }.
	 * 2. Прямое формирование пути: передайте { service: '0004', characteristic: '000f' }.
	 * @param {object} props - Описание характеристики.
	 * @param {string} props.service - UUID сервиса или его короткий ID для пути.
	 * @param {string} props.characteristic - UUID характеристики или ее короткий ID для пути.
	 * @returns {Promise<BluetoothCharacteristic>} Прокси-объект характеристики.
	 * @throws {Error} Если характеристика не найдена.
	 */
	async getCharacteristic({ service, characteristic }) {
		let path;
		const uuidMap = this.bluetooth.connected[this.id]?.class?.uuidMap;
		if (uuidMap) {
			if (service.includes('-') && uuidMap.services?.[service])
				service = uuidMap.services[service];
			if (characteristic.includes('-') && uuidMap.characteristics?.[characteristic])
				characteristic = uuidMap.characteristics[characteristic];
		}
		if (service.includes('-') || characteristic.includes('-')) {
			await this.discoverGattProfile();
			const serviceInfo = this.gattProfile[service];
			if (!serviceInfo)
				throw new Error(`Service with UUID ${service} not found on device.`);
			const charInfo = serviceInfo.characteristics[characteristic];
			if (!charInfo)
				throw new Error(`Characteristic with UUID ${characteristic} not found in service ${service}.`);
			path = charInfo.path;
		} else
			path = `${this.proxy.path}/service${service}/char${characteristic}`;
		if (this.characteristics.has(path))
			return this.characteristics.get(path);
		const proxy = await this.proxy.bus.getProxyObject('org.bluez', path);
		const iface = proxy.getInterface('org.bluez.GattCharacteristic1')
		const charProxied = createFallbackProxy(new BluetoothCharacteristic(iface), iface);
		this.characteristics.set(path, charProxied);
		return charProxied;
	};

	/**
	 * Обнаруживает и кэширует полный GATT-профиль устройства (все сервисы и характеристики).
	 * Этот метод является относительно дорогостоящей операцией и должен вызываться только при необходимости.
	 * Результаты кэшируются для последующих вызовов.
	 * @returns {Promise<GattProfile>}
	 */
	async discoverGattProfile() {
		if (this.gattProfile) {
			this.client?.log('debug', `GATT profile for ${this.id} already cached. Returning cached version.`);
			return this.gattProfile;
		}
		this.client?.log('info', `Discovering GATT profile for device ${this.id}...`);
		if (!this.objectManager) {
			this.client?.log('debug', `D-Bus ObjectManager not found, getting it now.`);
			const bluezProxy = await this.proxy.bus.getProxyObject('org.bluez', '/');
			this.objectManager = bluezProxy.getInterface('org.freedesktop.DBus.ObjectManager');
		}
		const managedObjects = await this.objectManager.GetManagedObjects();
		this.client?.log('debug', `Got ${Object.keys(managedObjects).length} managed objects from D-Bus.`);
		const /** @type {GattProfile} */ services = {};
		const characteristicsByServicePath = {};
		for (const path in managedObjects) {
			if (!path.startsWith(this.proxy.path))
				continue;
			const interfaces = managedObjects[path];
			const serviceInterface = interfaces['org.bluez.GattService1'];
			const charInterface = interfaces['org.bluez.GattCharacteristic1'];
			if (serviceInterface) {
				const uuid = serviceInterface.UUID.value;
				this.client?.log('debug', `Found GATT Service: UUID=${uuid}, Path=${path}`);
				services[uuid] = {
					path,
					characteristics: {}
				};
				characteristicsByServicePath[path] = services[uuid].characteristics;
			} else if (charInterface) {
				const parentServicePath = charInterface.Service.value;
				const parentServiceChars = characteristicsByServicePath[parentServicePath];
				if (parentServiceChars) {
					const uuid = charInterface.UUID.value;
					const flags = charInterface.Flags.value;
					this.client?.log('debug', `  - Found GATT Characteristic: UUID=${uuid}, Flags=[${flags.join(', ')}], Path=${path}`);
					parentServiceChars[uuid] = { path, flags };
				} else
					this.client?.log('warn', `Found characteristic ${path} but its parent service ${parentServicePath} was not found in the map.`);
			}
		}
		this.gattProfile = services;
		this.client?.log('info', `GATT profile discovery complete for ${this.id}. Found ${Object.keys(services).length} services.`);
		return this.gattProfile;
	};
};

/**
 * Класс для взаимодействия с Bluetooth LE устройствами.
 * @extends EventEmitter
 */
export default class Bluetooth extends EventEmitter {
	/**
	 * Объект для хранения подключенных Bluetooth устройств, где ключ - это ID устройства.
	 * @type {Object.<string, Device>}
	 */
	connected = {};

	/**
	 * Объект для хранения обнаруженных Bluetooth устройств, где ключ - это ID устройства.
	 * @type {Object.<string, DeviceConfig & {path: string}>}
	 */
	devices = {};

	/**
	 * Фильтры UUID для поиска Bluetooth устройств.
	 * @type {string[]|null}
	 */
	filters = null;

	/**
	 * Карта соответствия MAC-адреса и bindkey.
	 * @type {Map<string, Buffer>}
	 */
	bindKeys = new Map();

	/**
	 * Флаг, указывающий, выполняется ли в данный момент обнаружение Bluetooth устройств.
	 * @type {boolean}
	 */
	isDiscovering = false;

	/**
	 * Флаг активного мониторинга рекламных пакетов.
	 * @type {boolean}
	 */
	isMonitoring = false;

	/**
	 * Счетчик активных запросов на обнаружение.
	 * @type {number}
	 */
	#discoveringCount = 0;

	/**
	 * Счетчик активных подписок на мониторинг
	 * @type {number}
	 */
	#monitoringCount = 0;

	/**
	 * Кэш последних значений RSSI для каждого устройства.
	 * @type {Map<string, number>}
	 */
	#rssi = new Map();

	/**
	 * Экземпляр класса XiaomiMiHome.
	 * @type {XiaomiMiHome}
	 */
	client = null;

	/**
	 * Создает и инициализирует экземпляр класса Bluetooth.
	 * @returns {Promise<Bluetooth>} Экземпляр класса Bluetooth.
	 */
	static async createBluetooth() {
		const bluetooth = new this();
		await bluetooth.defaultAdapter();
		process.once('SIGINT', async () => {
			await bluetooth.destroy();
			process.exit(130);
		});
		process.once('uncaughtException', async err => {
			await bluetooth.destroy();
			throw err;
		});
		return bluetooth;
	};

	/**
	 * Регистрирует bindkey для устройства.
	 * @param {string} mac MAC-адрес устройства.
	 * @param {string} bindkey Ключ.
	 */
	registerBindKey(mac, bindkey) {
		if (mac && bindkey)
			this.bindKeys.set(mac.toUpperCase(), Buffer.from(bindkey, 'hex'));
	};

	/**
	 * Конструктор класса Bluetooth.
	 * @param {XiaomiMiHome} [client] Экземпляр класса XiaomiMiHome.
	 */
	constructor(client) {
		super();
		this.client = client;
		client?.config?.devices?.forEach(({ mac, bindkey }) => this.registerBindKey(mac, bindkey));
	};

	/**
	 * Проверяет доступность BlueZ сервиса в системе.
	 * @returns {Promise<boolean>} true если сервис доступен, false в противном случае.
	 */
	async checkBlueZService() {
		if (process.env.DBUS_SYSTEM_BUS_ADDRESS)
			return true;
		try {
			const dbus = await import('dbus-next');
			const bus = dbus.systemBus();
			const dbusProxy = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus');
			const dbusInterface = dbusProxy.getInterface('org.freedesktop.DBus');
			const services = await dbusInterface.ListNames();
			const isBlueZAvailable = services.includes('org.bluez');
			bus.disconnect();
			return isBlueZAvailable;
		} catch (err) {
			this.client?.log('debug', `Failed to check BlueZ service availability:`, err);
			return false;
		}
	};

	/**
	 * Инициализирует адаптер Bluetooth по умолчанию (обновленная версия).
	 * @param {string} [device='hci0'] Имя адаптера Bluetooth.
	 * @returns {Promise<object>} Интерфейс адаптера Bluetooth.
	 * @throws {Error} Если нет доступа к Bluetooth сервисам через D-Bus.
	 */
	async defaultAdapter(device = 'hci0') {
		this.client?.log('info', `Initializing Bluetooth adapter: ${device}`);
		const isBlueZAvailable = await this.checkBlueZService();
		if (!isBlueZAvailable)
			throw new Error([
				'Bluetooth Service Unavailable',
				'The BlueZ Bluetooth service is not running or not available on this system.',
				'To fix this issue, try the following steps:',
				'1. Install BlueZ if it\'s not installed:',
				'   sudo apt-get install bluez  # On Debian/Ubuntu',
				'   sudo yum install bluez      # On RHEL/CentOS',
				'2. Start the Bluetooth service:',
				'   sudo systemctl start bluetooth',
				'   sudo systemctl enable bluetooth',
				'3. Check if your Bluetooth adapter is available:',
				'   hciconfig',
				'   sudo hciconfig hci0 up',
				'4. Verify the service is running:',
				'   systemctl status bluetooth'
			].join('\n'));
		try {
			const dbus = await import('dbus-next');
			this.device = device;
			this.path = `/org/bluez/${device}`;
			this.client?.log('debug', `Connecting to D-Bus system bus for Bluetooth`);
			this.bus = await new Promise((resolve, reject) => {
				try {
					let /** @type {any} */ options;
					if (process.env.DBUS_SYSTEM_BUS_ADDRESS)
						options = { authMethods: ['ANONYMOUS', 'EXTERNAL'] };
					const bus = dbus.systemBus(options);
					bus.once('message', () => resolve(bus));
					bus.once('error', err => reject(err));
				} catch (err) {
					reject(err);
				}
			});
			this.client?.log('debug', `Getting D-Bus proxy object for org.bluez at ${this.path}`);
			try {
				this.bluez = await this.bus.getProxyObject('org.bluez', this.path);
			} catch (err) {
				if (err.type === 'org.freedesktop.DBus.Error.AccessDenied') {
					const { fileURLToPath } = await import('url')
					const path = await import('path');
					const __filename = fileURLToPath(import.meta.url);
					const __dirname = path.dirname(path.join(__filename, '..'));
					throw new Error([
						'Bluetooth Access Denied',
						'Your user account doesn\'t have permission to access Bluetooth services via D-Bus.', '',
						'To fix this issue, run the following command:',
						`sudo cp ${__dirname}/xmihome_bluetooth.conf /etc/dbus-1/system.d/`, '',
						'After running this command, restart the Bluetooth service with:',
						'sudo systemctl restart bluetooth', '',
						'This will grant your user the necessary Bluetooth permissions.'
					].join('\n'));
				}
				throw err;
			}
			this.client?.log('debug', `Getting D-Bus interface org.bluez.Adapter1`);
			this.adapter = this.bluez.getInterface('org.bluez.Adapter1');
			this.client?.log('debug', `Adding D-Bus signal match`);
			await this.bus.call(new dbus.Message({
				destination: 'org.freedesktop.DBus',
				path: '/org/freedesktop/DBus',
				interface: 'org.freedesktop.DBus',
				member: 'AddMatch',
				signature: 's',
				body: ["type='signal'"]
			}));
			this.bus.on('message', this.#listener.bind(this));
			this.client?.log('info', `Bluetooth adapter ${device} initialized successfully`);
			return this.adapter;
		} catch (err) {
			this.adapter = null;
			this.client?.log('error', `Failed to initialize Bluetooth adapter ${device}:`, err);
			throw err;
		}
	};

	/**
	 * Извлекает свойства из объекта Variant D-Bus.
	 * @param {object} properties Объект свойств D-Bus.
	 * @returns {object} Объект извлеченных свойств.
	 */
	extractProperties(properties) {
		const result = {};
		if (!Object.keys(properties).length)
			return;
		for (const key in properties) {
			const prop = properties[key];
			if (prop?.constructor.name === 'Variant') {
				const { value } = prop;
				if (value?.constructor.name === 'Object')
					result[key] = this.extractProperties(value);
				else
					result[key] = value;
			} else
				result[key] = prop;
		}
		return result;
	};

	/**
	 * Слушатель сообщений D-Bus для обработки событий Bluetooth.
	 * @param {object} msg Сообщение D-Bus.
	 */
	async #listener(msg) {
		const path = msg.path;
		if (!path?.startsWith(this.path) || !Array.isArray(msg.body))
			return;
		const iface = msg.body[0];
		const device = path.split('/')[4];
		const properties = this.extractProperties(msg.body[1]);
		if (!properties)
			return;
		this.client?.log('debug', `D-Bus signal received: path=${path}, interface=${iface}, member=${msg.member}`);
		switch (iface) {
			case 'org.bluez.Adapter1': {
				this.emit('adapter', properties);
				break;
			};
			case 'org.bluez.Device1': {
				if (!device)
					return;
				if (this.connected[device]) {
					if (properties.hasOwnProperty('Connected')) {
						this.client?.log('debug', `Device ${device} Connected property changed to: ${properties.Connected}`);
						if (!properties.Connected && this.connected[device].isConnected)
							this.connected[device].emit('external_disconnect', 'D-Bus Connected property became false');
					}
					this.connected[device].emit('properties', properties);
				}
				if (this.isDiscovering && !this.devices[device]) {
					this.client?.log('debug', `Processing potential new device: ${device}`);
					this.devices[device] = { path };
					if (!properties.Address || !properties.Name || (this.filters && !properties.ServiceData)) {
						const proxy = await this.bus.getProxyObject('org.bluez', path);
						const proxyProperties = await proxy.getInterface('org.freedesktop.DBus.Properties').GetAll(iface).then(this.extractProperties.bind(this));
						for (const key in proxyProperties) {
							properties[key] = proxyProperties[key];
						}
					}
					if (this.filters) {
						const uuid = properties.ServiceData && Object.keys(properties.ServiceData)[0];
						if (!uuid || !this.filters.includes(uuid))
							return;
					}
					const config = {
						path,
						name: properties.Name,
						mac: properties.Address
					};
					this.devices[device] = config;
					this.emit(`available:${device}`, config);
					this.emit('available', config);
				}
				if (properties.RSSI !== undefined)
					this.#rssi.set(device, properties.RSSI);
				if (this.isMonitoring && properties.ServiceData) {
					const id = UUID.find(id => properties.ServiceData[id]);
					if (id) {
						const beacon = new MiBeacon(this, device, properties.ServiceData[id], id);
						const parsed = beacon.parse();
						if (parsed) {
							const msg = {
								rssi: properties.RSSI ?? this.#rssi.get(device),
								...parsed
							};
							this.emit(`advertisement:${parsed.mac}`, msg);
							this.emit('advertisement', msg);
						}
					}
				}
				this.emit(`properties:${device}`, properties);
				break;
			};
			case 'org.bluez.GattCharacteristic1': {
				if ((msg.interface !== 'org.freedesktop.DBus.Properties') || (msg.member !== 'PropertiesChanged') || !device || !this.connected[device])
					return;
				this.connected[device].emit('properties', properties);
				const characteristic = this.connected[device].device?.characteristics?.get(path);
				if (characteristic && (properties.Value !== undefined)) {
					this.client?.log('debug', `Characteristic value changed: path=${path}, device=${device}, value=${properties.Value?.toString('hex')}`);
					characteristic.emit('valuechanged', properties.Value);
				}
				break;
			};
		};
	};

	/**
	 * Ожидает обнаружения определенного Bluetooth-устройства.
	 * Сначала проверяет кэш уже обнаруженных устройств. Если устройство не найдено,
	 * запускает сканирование (если оно еще не запущено) и ждет события 'available'.
	 * @param {string} mac MAC-адрес устройства для ожидания.
	 * @param {number|null} [ms=null] - Максимальное время ожидания в миллисекундах. Если null или 0, будет ждать бессрочно.
	 * @returns {Promise<DeviceConfig & {path: string}>} Промис, который разрешается объектом конфигурации найденного устройства (`{ path, name, mac }`).
	 * @throws {Error} Срабатывает, если время ожидания истекло до обнаружения устройства.
	 */
	async waitDevice(mac, ms = null) {
		const id = mac.replace(new RegExp(':', 'g'), '_').toUpperCase();
		const config = Object.values(this.devices).find(device => device.mac === mac);
		if (config) {
			this.client?.log('debug', `Device ${mac} found immediately in discovery cache.`);
			return config;
		}
		this.client?.log('debug', `Waiting for device ${mac} to be discovered...${ms ? ` (timeout: ${ms}ms)` : ''}`);
		return new Promise((resolve, reject) => {
			let timerId;
			const isDiscovering = this.isDiscovering;
			if (!isDiscovering)
				this.startDiscovery();
			const cleanup = () => {
				clearTimeout(timerId);
				this.off(`available:dev_${id}`, onDeviceAvailable);
				if (!isDiscovering)
					this.stopDiscovery();
			};
			const onDeviceAvailable = (/** @type {DeviceConfig & {path: string}} */ config) => {
				this.client?.log('debug', `Device ${mac} was discovered via event.`);
				cleanup();
				resolve(config);
			};
			this.once(`available:dev_${id}`, onDeviceAvailable);
			if (ms && (ms > 0))
				timerId = setTimeout(() => {
					this.client?.log('warn', `Discovery timeout after ${ms}ms for device ${mac}.`);
					cleanup();
					reject(new Error(`Discovery timeout after ${ms}ms for device ${mac}`));
				}, ms);
		});
	};

	/**
	 * Получает интерфейс устройства Bluetooth по MAC-адресу.
	 * Если устройство не найдено в кэше, выполняет поиск устройства.
	 * @param {string} mac MAC-адрес устройства.
	 * @returns {Promise<object>} Прокси-объект интерфейса устройства Bluetooth.
	 * @throws {Error} Если произошла ошибка D-Bus или устройство не найдено в течение таймаута.
	 */
	async getDevice(mac) {
		let proxy, device;
		const id = mac.replace(new RegExp(':', 'g'), '_').toUpperCase();
		this.client?.log('debug', `Getting Bluetooth device interface for MAC: ${mac} (ID: ${id})`);
		if (!this.adapter) {
			this.client?.log('info', 'Bluetooth adapter not initialized, initializing now.');
			await this.defaultAdapter();
		}
		try {
			proxy = await this.bus.getProxyObject('org.bluez', `${this.path}/dev_${id}`);
			this.client?.log('debug', `Found existing D-Bus proxy for device ${id}`);
			device = proxy.getInterface('org.bluez.Device1');
		} catch (err) {
			this.client?.log('info', `Device ${mac} not found directly, starting discovery search (timeout: ${GET_DEVICE_DISCOVERY_TIMEOUT}ms)...`);
			const config = await this.waitDevice(mac, GET_DEVICE_DISCOVERY_TIMEOUT);
			this.client?.log('debug', `Device ${mac} discovered, getting proxy from path: ${config.path}`);
			proxy = await this.bus.getProxyObject('org.bluez', config.path);
			device = proxy.getInterface('org.bluez.Device1');
		};
		this.client?.log('debug', `Returning device interface for ${mac}`);
		return createFallbackProxy(new BluetoothDevice(device, proxy, this), device);
	};

	/**
	 * Удаляет устройство из кэша BlueZ и разрывает соединение, если оно установлено.
	 * @param {string} mac MAC-адрес устройства.
	 * @returns {Promise<boolean>}
	 */
	async removeDevice(mac) {
		const id = mac.replace(/:/g, '_').toUpperCase();
		if (!this.adapter) {
			this.client?.log('info', 'Bluetooth adapter not initialized, initializing now.');
			await this.defaultAdapter();
		}
		const path = `${this.path}/dev_${id}`;
		try {
			this.client?.log('debug', `Removing device from BlueZ cache: ${path}`);
			await this.adapter.RemoveDevice(path);
			return true;
		} catch (err) {
			return false;
		}
	};

	/**
	 * Запускает обнаружение Bluetooth устройств.
	 * @param {string[]} [filters] Массив UUID фильтров для обнаружения устройств.
	 * @returns {Promise<boolean>}
	 */
	async startDiscovery(filters) {
		this.#discoveringCount++;
		if (this.isDiscovering) {
			this.client?.log('warn', 'Attempted to start discovery, but it is already running.');
			return;
		}
		if (!this.adapter)
			await this.defaultAdapter();
		if (this.adapter)
			try {
				this.client?.log('info', `Starting Bluetooth discovery${filters ? ' with filters: ' + filters.join(', ') : ''}`);
				this.filters = filters;
				this.isDiscovering = true;
				await this.adapter.StartDiscovery();
				this.client?.log('debug', 'Bluetooth discovery started successfully via D-Bus');
				return true;
			} catch (err) {
				if (err.type === 'org.bluez.Error.InProgress') {
					this.client?.log('debug', 'Discovery already in progress, ignoring error.');
					return true;
				}
				this.isDiscovering = false;
				this.client?.log('error', 'Failed to start Bluetooth discovery:', err);
				throw err;
			}
		return false;
	};

	/**
	 * Останавливает обнаружение Bluetooth устройств.
	 * @param {boolean} [force=false] Если true, принудительно сбрасывает счетчик и останавливает обнаружение.
	 * @returns {Promise<void>}
	 */
	async stopDiscovery(force = false) {
		if (!this.isDiscovering)
			return;
		this.#discoveringCount = force ? 0 : Math.max(0, this.#discoveringCount - 1);
		if (this.#discoveringCount > 0)
			return;
		this.client?.log('info', 'Stopping Bluetooth discovery');
		this.isDiscovering = false;
		this.devices = {};
		try {
			await this.adapter.StopDiscovery();
			this.client?.log('debug', 'Bluetooth discovery stopped successfully via D-Bus');
		} catch (err) {
			if (err.type === 'org.bluez.Error.Failed')
				this.client?.log('debug', 'Discovery was not running on the adapter, ignoring error.');
			else {
				this.client?.log('error', 'Failed to stop Bluetooth discovery:', err);
				throw err;
			}
		}
	};

	/**
	 * Запускает режим мониторинга рекламных пакетов (passive scanning).
	 * @returns {Promise<boolean>}
	 */
	async startMonitoring() {
		this.#monitoringCount++;
		if (this.isMonitoring)
			return;
		this.client?.log('info', 'Starting Bluetooth monitoring');
		this.isMonitoring = true;
		return this.startDiscovery();
	};

	/**
	 * Останавливает режим мониторинга.
	 * @param {boolean} [force=false] Если true, принудительно сбрасывает счетчик и останавливает мониторинг.
	 * @returns {Promise<void>}
	 */
	async stopMonitoring(force = false) {
		if (!this.isMonitoring)
			return;
		this.#monitoringCount = force ? 0 : Math.max(0, this.#monitoringCount - 1);
		if (this.#monitoringCount > 0)
			return;
		this.client?.log('info', 'Stopping Bluetooth monitoring');
		this.isMonitoring = false;
		await this.stopDiscovery();
	};

	/**
	 * Освобождает ресурсы и отключается от Bluetooth адаптера.
	 * @returns {Promise<void>}
	 */
	async destroy() {
		this.client?.log('info', 'Destroying Bluetooth instance...');
		if (this.isMonitoring)
			await this.stopMonitoring(true);
		if (this.isDiscovering)
			await this.stopDiscovery(true);
		if (this.bus) {
			this.bus.off('message', this.#listener);
			for (const device in this.connected) {
				await this.connected[device].disconnect();
			}
			this.bus.disconnect();
			this.bus = null;
		}
		this.adapter = null;
		this.client?.log('info', 'Bluetooth instance destroyed.');
	};
};
