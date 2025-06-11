import EventEmitter from 'events';

const GET_DEVICE_DISCOVERY_TIMEOUT = 20000;

/**
 * Класс для взаимодействия с Bluetooth LE устройствами.
 * @extends EventEmitter
 */
export class Bluetooth extends EventEmitter {
	/**
	 * Объект для хранения подключенных Bluetooth устройств, где ключ - это ID устройства.
	 * @type {object<string, Device>}
	 */
	connected = {};

	/**
	 * Объект для хранения обнаруженных Bluetooth устройств, где ключ - это ID устройства.
	 * @type {object<string, object>}
	 */
	devices = {};

	/**
	 * Фильтры UUID для поиска Bluetooth устройств.
	 * @type {string[]|null}
	 */
	filters = null;

	/**
	 * Флаг, указывающий, выполняется ли в данный момент обнаружение Bluetooth устройств.
	 * @type {boolean}
	 */
	isDiscovering = false;

	/**
	 * Создает и инициализирует экземпляр класса Bluetooth.
	 * @static
	 * @async
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
	 * Создает Proxy-обертку, которая делегирует вызовы на интерфейс dbus-next,
	 * сохраняя при этом методы и свойства оригинального объекта-обертки.
	 * @static
	 * @param {object} target - Экземпляр класса-обертки.
	 * @param {import('dbus-next').ProxyInterface} dbusInterface - Интерфейс dbus-next, на который будут проксироваться вызовы.
	 * @returns {Proxy} Готовый к использованию прокси-объект.
	 */
	static createDbusProxy(target, dbusInterface) {
		return new Proxy(target, {
			get(target, prop, receiver) {
				if (prop in target)
					return Reflect.get(target, prop, receiver);
				const dbusProp = dbusInterface[prop];
				if (typeof dbusProp === 'function')
					return dbusProp.bind(dbusInterface);
				return dbusProp;
			}
		});
	};

	/**
	 * Конструктор класса Bluetooth.
	 * @param {XiaomiMiHome} client Экземпляр класса XiaomiMiHome.
	 */
	constructor(client) {
		super();
		this.client = client;
	};

	/**
	 * Инициализирует адаптер Bluetooth по умолчанию.
	 * @async
	 * @param {string} [device='hci0'] Имя адаптера Bluetooth.
	 * @returns {Promise<object>} Интерфейс адаптера Bluetooth.
	 * @throws {Error} Если нет доступа к Bluetooth сервисам через D-Bus.
	 */
	async defaultAdapter(device='hci0') {
		this.client?.log('info', `Initializing Bluetooth adapter: ${device}`);
		try {
			const dbus = await import('dbus-next');
			this.device = device;
			this.path = `/org/bluez/${device}`;
			this.client?.log('debug', `Connecting to D-Bus system bus for Bluetooth`);
			this.bus = await new Promise((resolve, reject) => {
				try {
					const bus = dbus.systemBus();
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
				body: [ "type='signal'" ]
			}));
			this.bus.on('message', this.listener.bind(this));
			this.client?.log('info', `Bluetooth adapter ${device} initialized successfully`);
			return this.adapter;
		} catch (err) {
			this.client?.log('error', `Failed to initialize Bluetooth adapter ${device}:`, err);
			if (err.type !== 'org.freedesktop.DBus.Error.AccessDenied')
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
			}else
				result[key] = prop;
		}
		return result;
	};

	/**
	 * Слушатель сообщений D-Bus для обработки событий Bluetooth.
	 * @private
	 * @param {object} msg Сообщение D-Bus.
	 */
	async listener(msg) {
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
	 * @async
	 * @param {string} mac MAC-адрес устройства для ожидания.
	 * @param {number|null} [ms=null] - Максимальное время ожидания в миллисекундах. Если null или 0, будет ждать бессрочно.
	 * @returns {Promise<object>} Промис, который разрешается объектом конфигурации найденного устройства (`{ path, name, mac }`).
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
			const onDeviceAvailable = config => {
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
	 * @async
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
			await this.defaultAdapter(this.device);
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
		return this.constructor.createDbusProxy(new Device(device, proxy, this), device);
	};

	/**
	 * Запускает обнаружение Bluetooth устройств.
	 * @async
	 * @param {string[]} [filters] Массив UUID фильтров для обнаружения устройств.
	 * @returns {Promise<void>}
	 */
	async startDiscovery(filters) {
		if (this.isDiscovering) {
			this.client?.log('warn', 'Attempted to start discovery, but it is already running.');
			return;
		}
		this.client?.log('info', `Starting Bluetooth discovery${filters ? ' with filters: ' + filters.join(', ') : ''}`);
		this.filters = filters;
		this.isDiscovering = true;
		if (!this.adapter)
			await this.defaultAdapter(this.device);
		try {
			await this.adapter.StartDiscovery();
			this.client?.log('debug', 'Bluetooth discovery started successfully via D-Bus');
		} catch (err) {
			this.isDiscovering = false;
			this.client?.log('error', 'Failed to start Bluetooth discovery:', err);
			throw err;
		}
	};

	/**
	 * Останавливает обнаружение Bluetooth устройств.
	 * @async
	 * @returns {Promise<void>}
	 */
	async stopDiscovery() {
		if (!this.isDiscovering)
			return;
		this.client?.log('info', 'Stopping Bluetooth discovery');
		this.isDiscovering = false;
		this.devices = {};
		try {
			await this.adapter.StopDiscovery();
			this.client?.log('debug', 'Bluetooth discovery stopped successfully via D-Bus');
		} catch (err) {
			this.client?.log('error', 'Failed to stop Bluetooth discovery:', err);
			throw err;
		}
	};

	/**
	 * Освобождает ресурсы и отключается от Bluetooth адаптера.
	 * @async
	 * @returns {Promise<void>}
	 */
	async destroy() {
		this.client?.log('info', 'Destroying Bluetooth instance...');
		if (this.isDiscovering)
			await this.stopDiscovery();
		if (this.bus) {
			this.bus.off('message', this.listener);
			for (const device in this.connected) {
				await this.connected[device].disconnect();
			}
			await this.bus.disconnect();
			this.bus = null;
		}
		this.adapter = null;
		this.client?.log('info', 'Bluetooth instance destroyed.');
	};
};

/**
 * Класс-обертка для Bluetooth-устройства.
 * @class
 */
export class Device {
	/**
	 * @param {import('dbus-next').ProxyInterface} dbusInterface - Интерфейс org.bluez.Device1
	 * @param {import('dbus-next').ProxyObject} proxy - Прокси-объект устройства
	 * @param {Bluetooth} bluetooth - Экземпляр класса Bluetooth.
	 */
	constructor(dbusInterface, proxy, bluetooth) {
		this.bluetooth = bluetooth;
		this.dbusInterface = dbusInterface;
		this.proxy = proxy;
		this.objectManager = null;
		this.gattProfile = null;
		this.characteristics = new Map();
	};


	/**
	 * Возвращает уникальный идентификатор устройства в формате D-Bus (dev_XX_XX_XX_...).
	 * Этот ID извлекается из пути D-Bus объекта.
	 * @type {string}
	 * @readonly
	 */
	get id() {
		return this.proxy.path.split('/').pop();
	};

	/**
	 * Устанавливает соединение с устройством.
	 * @async
	 * @returns {Promise<void>}
	 */
	async connect() {
		await this.dbusInterface.Connect();
		// const properties = this.proxy.getInterface('org.freedesktop.DBus.Properties');
		// while (true) {
		// 	await new Promise(resolve => setTimeout(resolve), 500);
		// 	const servicesResolved = await properties.Get('org.bluez.Device1', 'ServicesResolved');
		// 	if (servicesResolved.value)
		// 		break;
		// }
		return new Promise(async (resolve, reject) => {
			const properties = this.proxy.getInterface('org.freedesktop.DBus.Properties');
			const isResolved = await properties.Get('org.bluez.Device1', 'ServicesResolved');
			if (isResolved.value)
				return resolve();
			let timerId;
			const onPropertiesChanged = changedProps => {
				if (changedProps.ServicesResolved) {
					clearTimeout(timerId);
					this.bluetooth.off(`properties:${this.id}`, onPropertiesChanged);
					resolve();
				}
			};
			timerId = setTimeout(() => {
				this.bluetooth.off(`properties:${this.id}`, onPropertiesChanged);
				reject(new Error(`Timed out after 10s waiting for services to be resolved.`));
			}, 10_000);
			this.bluetooth.on(`properties:${this.id}`, onPropertiesChanged);
		});
	};

	/**
	 * Разрывает соединение с устройством.
	 * @async
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
	 * @async
	 * @param {object} props - Описание характеристики.
	 * @param {string} props.service - UUID сервиса или его короткий ID для пути.
	 * @param {string} props.characteristic - UUID характеристики или ее короткий ID для пути.
	 * @returns {Promise<Characteristic>} Прокси-объект характеристики.
	 * @throws {Error} Если характеристика не найдена.
	 */
	async getCharacteristic({ service, characteristic }) {
		let path;
		if (service.includes('-') || characteristic.includes('-')) {
			await this.discoverGattProfile();
			const serviceInfo = this.gattProfile[service];
			if (!serviceInfo)
				throw new Error(`Service with UUID ${service} not found on device.`);
			const charInfo = serviceInfo.characteristics[characteristic];
			if (!charInfo)
				throw new Error(`Characteristic with UUID ${characteristic} not found in service ${service}.`);
			path = charInfo.path;
		}else
			path = `${this.proxy.path}/service${service}/char${characteristic}`;
		if (this.characteristics.has(path))
			return this.characteristics.get(path);
		const proxy = await this.proxy.bus.getProxyObject('org.bluez', path);
		const iface = proxy.getInterface('org.bluez.GattCharacteristic1')
		const charProxied = Bluetooth.createDbusProxy(new Characteristic(iface), iface);
		this.characteristics.set(path, charProxied);
		return charProxied;
	};

	/**
	 * Обнаруживает и кэширует полный GATT-профиль устройства (все сервисы и характеристики).
	 * Этот метод является относительно дорогостоящей операцией и должен вызываться только при необходимости.
	 * Результаты кэшируются для последующих вызовов.
	 * @async
	 * @returns {Promise<Map<string, {path: string, characteristics: Map<string, {path: string}>}>>}
	 *          Карта, где ключ - UUID сервиса, а значение - объект с путем к сервису и картой его характеристик.
	 */
	async discoverGattProfile() {
		if (this.gattProfile)
			return this.gattProfile;
		if (!this.objectManager) {
			const bluezProxy = await this.proxy.bus.getProxyObject('org.bluez', '/');
			this.objectManager = bluezProxy.getInterface('org.freedesktop.DBus.ObjectManager');
		}
		const managedObjects = await this.objectManager.GetManagedObjects();
		const services = {};
		const characteristicsByServicePath = {};
		for (const path in managedObjects) {
			if (!path.startsWith(this.proxy.path))
				continue;
			const interfaces = managedObjects[path];
			const serviceInterface = interfaces['org.bluez.GattService1'];
			const charInterface = interfaces['org.bluez.GattCharacteristic1'];
			if (serviceInterface) {
				const uuid = serviceInterface.UUID.value;
				services[uuid] = {
					path,
					characteristics: {}
				};
				characteristicsByServicePath[path] = services[uuid].characteristics;
			} else if (charInterface) {
				const parentServiceChars = characteristicsByServicePath[charInterface.Service.value];
				if (parentServiceChars)
					parentServiceChars[charInterface.UUID.value] = {
						path,
						flags: charInterface.Flags.value
					};
			}
		}
		this.gattProfile = services;
		return this.gattProfile;
	};
};

/**
 * Класс-обертка для GATT-характеристики.
 * @class
 */
export class Characteristic {
	/**
	 * @param {import('dbus-next').ProxyInterface} dbusInterface - Интерфейс org.bluez.GattCharacteristic1
	 */
	constructor(dbusInterface) {
		this.dbusInterface = dbusInterface;
	};

	/**
	 * Включает уведомления для этой характеристики.
	 * @async
	 */
	async startNotifications() {
		return this.dbusInterface.StartNotify();
	};

	/**
	 * Отключает уведомления для этой характеристики.
	 * @async
	 */
	async stopNotifications() {
		return this.dbusInterface.StopNotify();
	};

	/**
	 * Читает значение характеристики.
	 * @async
	 * @returns {Promise<Buffer>} Промис, который разрешится буфером со значением.
	 */
	async readValue() {
		return this.dbusInterface.ReadValue({});
	};

	/**
	 * Записывает значение в характеристику.
	 * @async
	 * @param {Buffer} buffer - Буфер данных для записи.
	 * @param {object} [options] - Опции для записи (например, { type: 'command' }).
	 */
	async writeValue(buffer) {
		return this.dbusInterface.WriteValue(buffer, {});
	};
};

export default Bluetooth;
