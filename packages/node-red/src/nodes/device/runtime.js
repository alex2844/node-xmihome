import Device from 'xmihome/device.js';
/** @import { Node, NodeAPI, NodeDef, NodeMessage } from 'node-red' */
/** @import { NodeInstance as ConfigNodeInstance, ConfigNode } from '../config/runtime.js' */
/** @import { Config as DeviceConfig } from 'xmihome/device.js' */
/** @import { XiaomiMiHome } from 'xmihome' */

/**
 * @typedef {{
 *   settings: string;
 *   device: string;
 *   deviceType: 'json'|'msg';
 *   action: 'getProperties'|'getProperty'|'setProperty'|'callAction'|'callMethod'|'subscribe'|'unsubscribe';
 *   property: string;
 *   propertyType: 'str'|'msg'|'flow'|'global'|'json';
 *   value: string;
 *   valueType: 'str'|'msg'|'flow'|'global'|'num'|'bool'|'json'|'date'|'jsonata';
 *   topic: string;
 *   topicType: 'str'|'msg'|'flow'|'global';
 * }} Config
 */
/** @typedef {NodeDef & Config} ConfigDef */

/** @typedef {Node & { instance: DeviceNode }} NodeInstance */

export class DeviceNode {
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
	 * @type {Config}
	 */
	#config;

	/**
	 * Экземпляр класса логики узла конфигурации.
	 * @type {ConfigNode}
	 */
	settings;

	/**
	 * Кеш последних полученных значений свойств для отображения в статусе.
	 * @type {Map<string, String>}
	 */
	values = new Map();

	/**
	 * @param {NodeInstance} node
	 * @param {ConfigDef} config
	 * @param {NodeAPI} RED
	 */
	constructor(node, config, RED) {
		this.#node = node;
		this.#config = config;
		this.#RED = RED;

		const configNode = RED.nodes.getNode(this.#config.settings);
		if (configNode)
			this.settings = (/** @type {ConfigNodeInstance} */ (configNode)).instance;
		else
			this.#node.warn('Config node not found or configured.');
		this.#node.on('input', this.#input.bind(this));
		this.#node.on('close', this.#close.bind(this));
		this.#node.status({});
	};

	/**
	 * Геттер для "ленивого" получения клиента из узла конфигурации.
	 * @returns {XiaomiMiHome}
	 * @throws {Error} Если узел конфигурации не настроен.
	 */
	get client() {
		if (!this.settings)
			throw new Error('Client is not initialized. Check configuration.');
		return this.settings.client;
	};

	/**
	 * Генерирует уникальный идентификатор устройства на основе его конфигурации.
	 * @param {DeviceConfig} device
	 * @returns {string}
	 */
	getDeviceId(device) {
		return Device.getDeviceId(device);
	};

	/**
	 * Извлекает и валидирует конфигурацию устройства из входящего сообщения или настроек узла.
	 * @param {NodeMessage} msg
	 * @returns {DeviceConfig}
	 * @throws {Error} Если конфигурация некорректна или отсутствует.
	 */
	getDeviceConfig(msg) {
		const deviceConfig = this.#RED.util.evaluateNodeProperty(this.#config.device, this.#config.deviceType, this.#node, msg);
		if (!deviceConfig || (typeof deviceConfig !== 'object'))
			throw new Error('Device configuration is missing or not an object');
		const /** @type {DeviceConfig} */ device = Object.fromEntries(
			Object.entries(deviceConfig).filter(([_, value]) => value != null && value !== '')
		);
		if (!device.id && !device.address && !device.mac)
			throw new Error('Device configuration must contain at least id, address, or mac');
		if (!device.model && device.mac && !device.name)
			this.#node.warn("Device configuration for Bluetooth is missing 'model', device might not work correctly without a specific class.");
		return device;
	};

	/**
	 * @param {string} value
	 * @param {number} [maxLength]
	 * @returns {string}
	 */
	truncate(value, maxLength = 20) {
		if (!value || (typeof value === 'object'))
			return null;
		if (typeof value !== 'string')
			value = String(value);
		return (value.length > maxLength) ? value.slice(0, (maxLength - 3)) + '...' : value;
	};

	/**
	 * @param {any} value
	 * @param {number} [maxLength]
	 * @returns {string}
	 */
	formatPropertyForStatus(value, maxLength = 20) {
		if ((value === null) || (value === undefined))
			return 'null';
		if (typeof value === 'boolean')
			return String(value);
		if ((typeof value === 'string') || (typeof value === 'number'))
			return this.truncate(String(value), maxLength);
		if (Array.isArray(value)) {
			if (value.length === 0)
				return '[]';
			if (value.every(item => ((typeof item === 'string') || (typeof item === 'number'))))
				return `[${this.truncate(value.join(', '), maxLength)}]`;
			return `[${value.length} items]`;
		}
		if (typeof value === 'object') {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return '{}';
			const str = keys.map(key => `${key}: ${this.truncate(String(value[key]), 10)}`).join(', ');
			return this.truncate(str, maxLength);
		}
		return String(value);
	};

	/**
	 * @param {string} deviceId
	 */
	#connected(deviceId) {
		if (this.settings.disconnectTimers.has(deviceId)) {
			clearTimeout(this.settings.disconnectTimers.get(deviceId));
			this.settings.disconnectTimers.delete(deviceId);
		}
		const device = this.settings.devices.get(deviceId);
		if (device) {
			this.#node.status({ fill: 'green', shape: 'dot', text: `Connected: ${device.connectionType}` });
			this.#node.send([null, {
				_msgid: this.#RED.util.generateId(),
				topic: `connection/${deviceId}/connected`,
				payload: {
					device: device.config,
					connectionType: device.connectionType,
					event: 'connected'
				}
			}]);
		}
	};

	/**
	 * @param {string} deviceId
	 * @param {number} [ms]
	 */
	#disconnect(deviceId, ms = 200) {
		const text = this.values.get(deviceId) || 'Disconnected';
		if (this.settings.devices.has(deviceId))
			this.settings.disconnectTimers.set(deviceId, setTimeout(() => {
				this.#node.status({ fill: 'grey', shape: 'ring', text });
				const device = this.settings.devices.get(deviceId);
				if (device) {
					this.#node.send([null, {
						_msgid: this.#RED.util.generateId(),
						topic: `connection/${deviceId}/disconnected`,
						payload: {
							device: device.config,
							event: 'disconnected'
						}
					}]);
					this.#cleanup(deviceId);
				}
				this.settings.disconnectTimers.delete(deviceId);
			}, ms));
	};

	/**
	 * @param {string} deviceId
	 * @param {object} _
	 * @param {string} _.reason
	 */
	#reconnecting(deviceId, { reason }) {
		if (this.settings.disconnectTimers.has(deviceId)) {
			clearTimeout(this.settings.disconnectTimers.get(deviceId));
			this.settings.disconnectTimers.delete(deviceId);
		}
		const device = this.settings.devices.get(deviceId);
		if (device) {
			this.#node.status({ fill: 'yellow', shape: 'dot', text: `Reconnecting` });
			this.#node.send([null, {
				_msgid: this.#RED.util.generateId(),
				topic: `connection/${deviceId}/reconnecting`,
				payload: {
					reason,
					device: device.config,
					event: 'reconnecting'
				}
			}]);
		}
	};

	/**
	 * @param {string} deviceId
	 * @param {object} _
	 * @param {number} _.attempts
	 * @param {string} _.error
	 */
	#reconnectFailed(deviceId, { attempts, error }) {
		if (this.settings.disconnectTimers.has(deviceId)) {
			clearTimeout(this.settings.disconnectTimers.get(deviceId));
			this.settings.disconnectTimers.delete(deviceId);
		}
		const device = this.settings.devices.get(deviceId);
		if (device) {
			this.#node.status({ fill: 'red', shape: 'ring', text: `Reconnect failed` });
			this.#node.send([null, {
				_msgid: this.#RED.util.generateId(),
				topic: `connection/${deviceId}/reconnect_failed`,
				payload: {
					attempts, error,
					device: device.config,
					event: 'reconnect_failed'
				}
			}]);
			this.#cleanup(deviceId);
		}
	};

	/**
	 * @param {string} deviceId
	 */
	async #cleanup(deviceId) {
		const device = this.settings.devices.get(deviceId);
		if (!device)
			return;
		this.#node.debug(`Cleaning up and disconnecting device: ${deviceId}`);
		try {
			await device.disconnect();
		} catch (err) {
			this.#node.error(`Error during cleanup disconnect for ${deviceId}: ${err}`)
		}
		device.removeAllListeners();
		this.settings.devices.delete(deviceId);
		this.values.delete(deviceId);
	};

	/**
	 * @param {NodeMessage} msg
	 * @param {(...args: any[]) => void} send
	 * @param {(err?: Error) => void} done
	 */
	async #input(msg, send, done) {
		let result, device, deviceConfig, deviceId;
		this.#node.status({ fill: 'blue', shape: 'dot', text: 'Getting device...' });
		const topic = this.#RED.util.evaluateNodeProperty(this.#config.topic, this.#config.topicType, this.#node, msg);
		const value = this.#RED.util.evaluateNodeProperty(this.#config.value, this.#config.valueType, this.#node, msg);
		const property = this.#RED.util.evaluateNodeProperty(this.#config.property, this.#config.propertyType, this.#node, msg);
		const formattedProperty = this.formatPropertyForStatus(property);
		try {
			deviceConfig = this.getDeviceConfig(msg);
			deviceId = this.getDeviceId(deviceConfig);
			if (this.settings.disconnectTimers.has(deviceId)) {
				this.#node.debug(`Cancelling pending disconnect for ${deviceId} due to new command.`);
				clearTimeout(this.settings.disconnectTimers.get(deviceId));
				this.settings.disconnectTimers.delete(deviceId);
			}
			if (!['getProperties', 'getProperty', 'setProperty', 'callAction', 'callMethod', 'subscribe', 'unsubscribe'].includes(this.#config.action))
				throw new Error(`Invalid action specified: ${this.#config.action}`);
			if ((this.#config.action !== 'getProperties') && !property)
				throw new Error('Property name is missing (configure node or provide msg.property)');
			if (this.settings.devices.has(deviceId)) {
				device = this.settings.devices.get(deviceId);
				this.#node.debug(`Using existing device instance for key: ${deviceId}`);
			} else {
				device = await this.client.getDevice(deviceConfig);
				device.on('connected', this.#connected.bind(this, deviceId));
				device.on('disconnect', this.#disconnect.bind(this, deviceId));
				device.on('reconnecting', this.#reconnecting.bind(this, deviceId));
				device.on('reconnect_failed', this.#reconnectFailed.bind(this, deviceId));
				this.settings.devices.set(deviceId, device);
				this.#node.debug(`Created and stored new device instance for key: ${deviceId}`);
			}
			if (this.#config.action !== 'unsubscribe') {
				this.#node.status({ fill: 'blue', shape: 'dot', text: `Connecting (${this.client.config.connectionType || 'auto'})...` });
				await device.connect();
			}
			this.#node.debug(`Action: ${this.#config.action}, Property: ${property}`);
			switch (this.#config.action) {
				case 'getProperties':
				case 'getProperty': {
					this.#node.status({ fill: 'blue', shape: 'dot', text: `Getting ${formattedProperty}...` });
					const payload = this.#config.action === 'getProperties' ? await device.getProperties() : await device.getProperty(property);
					const text = this.formatPropertyForStatus(payload);
					this.#node.debug(`Got property/ies: ${JSON.stringify(payload)}`);
					msg.payload = payload;
					msg.topic = topic || msg.topic || `property/${(this.#config.action === 'getProperties') ? '' : property}`;
					send([msg, null]);
					this.values.set(deviceId, text);
					this.#node.status({ fill: 'green', shape: 'dot', text });
					break;
				};
				case 'setProperty': {
					this.#node.status({ fill: 'blue', shape: 'dot', text: `Setting ${formattedProperty}...` });
					this.#node.debug(`Value to set for ${property}: ${JSON.stringify(value)}`);
					await device.setProperty(property, value);
					msg.payload = { property, value };
					msg.topic = topic || msg.topic || `property/${property}`;
					send([msg, null]);
					this.#node.log(`Property ${property} set to ${JSON.stringify(value)} successfully.`);
					this.#node.status({ fill: 'green', shape: 'dot', text: 'Done' });
					break;
				};
				case 'callAction': {
					this.#node.status({ fill: 'blue', shape: 'dot', text: `Calling ${formattedProperty}...` });
					this.#node.debug(`Calling action ${property} with params: ${JSON.stringify(value)}`);
					const payload = await device.callAction(property, value);
					msg.payload = payload;
					msg.topic = topic || msg.topic || `action/${property}`;
					send([msg, null]);
					this.#node.log(`Action ${property} called successfully.`);
					this.#node.status({ fill: 'green', shape: 'dot', text: 'Done' });
					break;
				};
				case 'callMethod': {
					const params = Array.isArray(value) ? value : (!value ? [] : [value]);
					this.#node.status({ fill: 'blue', shape: 'dot', text: `Calling ${formattedProperty}()...` });
					this.#node.debug(`Calling method ${property} with params: ${JSON.stringify(params)}`);
					if (typeof device[property] !== 'function')
						throw new Error(`Device object does not have a method named "${property}"`);
					const payload = await device[property](...params);
					msg.payload = payload;
					msg.topic = topic || msg.topic || `method/${property}`;
					send([msg, null]);
					this.#node.log(`Method ${property} called successfully.`);
					this.#node.status({ fill: 'green', shape: 'dot', text: 'Done' });
					break;
				};
				case 'subscribe': {
					this.#node.status({ fill: 'yellow', shape: 'dot', text: `Subscribing to ${formattedProperty}...` });
					const subscriptionKey = `${deviceId}_${formattedProperty}`;
					if (this.settings.subscriptions.has(subscriptionKey)) {
						this.#node.warn(`Already subscribed to ${property} for device ${deviceId}. Ignoring.`);
						this.#node.status({ fill: 'yellow', shape: 'ring', text: `Subscribed: ${property}` });
					} else {
						const callback = (/** @type {any} */ payload) => {
							this.#node.debug(`Notification received for ${property}: ${JSON.stringify(payload)}`);
							send([{
								_msgid: this.#RED.util.generateId(),
								payload, property,
								device: deviceConfig,
								topic: topic || msg.topic || `notify/${property}`
							}, null]);
							this.#node.status({ fill: 'yellow', shape: 'ring', text: `Subscribed: ${property}` });
						};
						this.settings.subscriptions.set(subscriptionKey, { device, property, callback });
						await device.startNotify(property, callback);
						this.#node.log(`Successfully subscribed to ${property} for device ${deviceId}`);
						this.#node.status({ fill: 'yellow', shape: 'ring', text: `Subscribed: ${property}` });
					}
					break;
				};
				case 'unsubscribe': {
					this.#node.status({ fill: 'blue', shape: 'dot', text: `Unsubscribing from ${formattedProperty}...` });
					const subscriptionKey = `${deviceId}_${formattedProperty}`;
					if (this.settings.subscriptions.has(subscriptionKey)) {
						const subscription = this.settings.subscriptions.get(subscriptionKey);
						await subscription.device.stopNotify(subscription.property);
						this.settings.subscriptions.delete(subscriptionKey);
						this.#node.log(`Successfully unsubscribed from ${property} for device ${deviceId}`);
						this.#node.status({ fill: 'grey', shape: 'ring', text: `Unsubscribed` });
					} else {
						this.#node.warn(`Not subscribed to ${property} for device ${deviceId}. Cannot unsubscribe.`);
						this.#node.status({});
					}
					break;
				};
			};
		} catch (err) {
			result = err;
			this.#node.status({ fill: 'red', shape: 'ring', text: 'Error' });
			if (deviceId)
				send([null, {
					_msgid: msg._msgid,
					topic: `error/${deviceId}`,
					payload: {
						event: 'error',
						error: err.message,
						action: this.#config.action,
						sourceMessage: msg,
						device: deviceConfig
					}
				}]);
		} finally {
			if (device && (this.#config.action !== 'subscribe')) {
				const deviceHasSubscriptions = [...this.settings.subscriptions.keys()].some(key => key.startsWith(deviceId));
				if (!deviceHasSubscriptions)
					this.#disconnect(deviceId, ((this.#config.action === 'unsubscribe') ? 0 : 30_000));
			}
		}
		done(result);
	};

	/**
	 * @param {boolean} removed
	 * @param {() => void} done
	 */
	async #close(removed, done) {
		const cleanupPromises = [];
		this.#node.debug(`Node closing, cleaning up all active connections and subscriptions... (removed: ${!!removed})`);
		for (const timerId of this.settings.disconnectTimers.values()) {
			clearTimeout(timerId);
		}
		for (const [key, device] of this.settings.devices.entries()) {
			this.#node.debug(`Disconnecting device instance for key: ${key}`);
			cleanupPromises.push(
				device.disconnect().catch(err => this.#node.error(`Error during cleanup disconnect for ${key}: ${err}`))
			);
		}
		try {
			await Promise.all(cleanupPromises);
			this.#node.log('All active device connections closed.');
		} catch (err) {
			this.#node.error('Error during connection cleanup on node close.');
		}
		this.settings.disconnectTimers.clear();
		this.settings.subscriptions.clear();
		this.settings.devices.clear();
		this.values.clear();
		this.#node.status({});
		done();
	};
};

/**
 * @param {NodeAPI} RED
 */
export default function (RED) {
	RED.nodes.registerType('xmihome-device', function (/** @type {ConfigDef} */ config) {
		RED.nodes.createNode(this, config);
		const node = /** @type {NodeInstance} */ (this);
		node.instance = new DeviceNode(node, config, RED);
	});
};
