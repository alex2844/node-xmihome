import EventEmitter from 'events';

const GET_DEVICE_DISCOVERY_TIMEOUT = 20000;

/**
 * Класс для взаимодействия с Bluetooth LE устройствами.
 * @extends EventEmitter
 */
class Bluetooth extends EventEmitter {
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
		this.client.log('info', `Initializing Bluetooth adapter: ${device}`);
		try {
			const dbus = await import('dbus-next');
			this.device = device;
			this.path = `/org/bluez/${device}`;
			this.client.log('debug', `Connecting to D-Bus system bus for Bluetooth`);
			this.bus = await new Promise((resolve, reject) => {
				try {
					const bus = dbus.systemBus();
					bus.once('message', () => resolve(bus));
					bus.once('error', err => reject(err));
				} catch (err) {
					reject(err);
				}
			});
			this.client.log('debug', `Getting D-Bus proxy object for org.bluez at ${this.path}`);
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
			this.client.log('debug', `Getting D-Bus interface org.bluez.Adapter1`);
			this.adapter = this.bluez.getInterface('org.bluez.Adapter1');
			this.client.log('debug', `Adding D-Bus signal match`);
			await this.bus.call(new dbus.Message({
				destination: 'org.freedesktop.DBus',
				path: '/org/freedesktop/DBus',
				interface: 'org.freedesktop.DBus',
				member: 'AddMatch',
				signature: 's',
				body: [ "type='signal'" ]
			}));
			this.bus.on('message', this.listener.bind(this));
			this.client.log('info', `Bluetooth adapter ${device} initialized successfully`);
			return this.adapter;
		} catch (err) {
			this.client.log('error', `Failed to initialize Bluetooth adapter ${device}:`, err);
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
		this.client.log('debug', `D-Bus signal received: path=${path}, interface=${iface}, member=${msg.member}`);
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
						this.client.log('debug', `Device ${device} Connected property changed to: ${properties.Connected}`);
						if (!properties.Connected && this.connected[device].isConnected)
							this.connected[device].emit('external_disconnect', 'D-Bus Connected property became false');
					}
					this.connected[device].emit('properties', properties);
				}
				if (this.isDiscovering && !this.devices[device]) {
					this.client.log('debug', `Processing potential new device: ${device}`);
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
				break;
			};
			case 'org.bluez.GattCharacteristic1': {
				if ((msg.interface !== 'org.freedesktop.DBus.Properties') || (msg.member !== 'PropertiesChanged') || !device || !this.connected[device])
					return;
				this.connected[device].emit('properties', properties);
				if (this.connected[device].device?.characteristics?.[path] && (properties.Value !== undefined)) {
					this.client.log('debug', `Characteristic value changed: path=${path}, device=${device}, value=${properties.Value?.toString('hex')}`);
					this.connected[device].device.characteristics[path].emit('valuechanged', properties.Value);
				}
				break;
			};
		};
	};

	/**
	 * Получает интерфейс устройства Bluetooth по MAC-адресу.
	 * Если устройство не найдено в кэше, выполняет поиск устройства.
	 * @async
	 * @param {string} mac MAC-адрес устройства.
	 * @returns {Promise<object>} Интерфейс устройства Bluetooth.
	 * @throws {Error} Если произошла ошибка D-Bus или устройство не найдено в течение таймаута.
	 */
	async getDevice(mac) {
		let proxy, device;
		const id = mac.replace(new RegExp(':', 'g'), '_').toUpperCase();
		this.client.log('debug', `Getting Bluetooth device interface for MAC: ${mac} (ID: ${id})`);
		if (!this.adapter) {
			this.client.log('info', 'Bluetooth adapter not initialized, initializing now.');
			await this.defaultAdapter(this.device);
		}
		try {
			proxy = await this.bus.getProxyObject('org.bluez', `${this.path}/dev_${id}`);
			this.client.log('debug', `Found existing D-Bus proxy for device ${id}`);
			device = proxy.getInterface('org.bluez.Device1');
		} catch (err) {
			this.client.log('info', `Device ${mac} not found directly, starting discovery search (timeout: ${GET_DEVICE_DISCOVERY_TIMEOUT}ms)...`);
			const config = await new Promise((resolve, reject) => {
				let timeoutId;
				const config = Object.values(this.devices).find(device => device.mac === mac);
				if (config)
					return resolve(config);
				const isDiscovering = this.isDiscovering;
				if (!isDiscovering)
					this.startDiscovery();
				const onDeviceAvailable = config => {
					clearTimeout(timeoutId);
					if (!isDiscovering)
						this.stopDiscovery();
					resolve(config);
				};
				timeoutId = setTimeout(() => {
					this.off(`available:dev_${id}`, onDeviceAvailable);
					if (!isDiscovering)
						this.stopDiscovery();
					reject(new Error(`Discovery timeout after ${GET_DEVICE_DISCOVERY_TIMEOUT}ms for device ${mac}`));
				}, GET_DEVICE_DISCOVERY_TIMEOUT);
				this.once(`available:dev_${id}`, onDeviceAvailable);
			});
			this.client.log('debug', `Device ${mac} discovered, getting proxy from path: ${config.path}`);
			proxy = await this.bus.getProxyObject('org.bluez', config.path);
			device = proxy.getInterface('org.bluez.Device1');
		}
		device.getCharacteristic = async function(prop) {
			const path = `${proxy.path}/service${prop.service}/char${prop.characteristic}`;
			if (!this.characteristics)
				this.characteristics = {};
			if (this.characteristics[path])
				return this.characteristics[path];
			const service = await proxy.bus.getProxyObject('org.bluez', path);
			const characteristic = service.getInterface('org.bluez.GattCharacteristic1');
			characteristic.startNotifications = function() {
				return this.StartNotify();
			};
			characteristic.stopNotifications = function() {
				return this.StopNotify();
			};
			characteristic.readValue = function() {
				return this.ReadValue({});
			};
			characteristic.writeValue = function(buffer) {
				return this.WriteValue(buffer, {});
			};
			this.characteristics[path] = characteristic;
			return this.characteristics[path];
		};
		this.client.log('debug', `Returning device interface for ${mac}`);
		return device;
	};

	/**
	 * Запускает обнаружение Bluetooth устройств.
	 * @async
	 * @param {string[]} [filters] Массив UUID фильтров для обнаружения устройств.
	 * @returns {Promise<void>}
	 */
	async startDiscovery(filters) {
		if (this.isDiscovering) {
			this.client.log('warn', 'Attempted to start discovery, but it is already running.');
			return;
		}
		this.client.log('info', `Starting Bluetooth discovery${filters ? ' with filters: ' + filters.join(', ') : ''}`);
		this.filters = filters;
		this.isDiscovering = true;
		if (!this.adapter)
			await this.defaultAdapter(this.device);
		try {
			await this.adapter.StartDiscovery();
			this.client.log('debug', 'Bluetooth discovery started successfully via D-Bus');
		} catch (err) {
			this.isDiscovering = false;
			this.client.log('error', 'Failed to start Bluetooth discovery:', err);
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
		this.client.log('info', 'Stopping Bluetooth discovery');
		this.isDiscovering = false;
		this.devices = {};
		try {
			await this.adapter.StopDiscovery();
			this.client.log('debug', 'Bluetooth discovery stopped successfully via D-Bus');
		} catch (err) {
			this.client.log('error', 'Failed to stop Bluetooth discovery:', err);
			throw err;
		}
	};

	/**
	 * Освобождает ресурсы и отключается от Bluetooth адаптера.
	 * @async
	 * @returns {Promise<void>}
	 */
	async destroy() {
		this.client.log('info', 'Destroying Bluetooth instance...');
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
		this.client.log('info', 'Bluetooth instance destroyed.');
	};
};
export default Bluetooth;
