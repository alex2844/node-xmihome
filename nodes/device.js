import Device from '../lib/device.js';

export default function(RED) {
	RED.nodes.registerType('xmihome-device', class DeviceNode {
		constructor(config) {
			RED.nodes.createNode(this, config);
			this.settings = RED.nodes.getNode(config.settings);
			this.config = config;
			this.devices = new Map();
			this.values = new Map();
			this.subscriptions = new Map();
			this.disconnectTimers = new Map();
			this.on('input', this.#input.bind(this));
			this.on('close', this.#close.bind(this));
			this.status({});
		};
		get client() {
			if (!this.settings)
				throw new Error('Client is not initialized. Check configuration.');
			return this.settings.client;
		};
		getDeviceConfig(msg) {
			const deviceConfig = RED.util.evaluateNodeProperty(this.config.device, this.config.deviceType, this, msg);
			if (!deviceConfig || (typeof deviceConfig !== 'object'))
				throw new Error('Device configuration is missing or not an object');
			const device = ['id', 'name', 'address', 'mac', 'token', 'model'].reduce((res, key) => {
				if ((deviceConfig[key] != null) && (deviceConfig[key] !== ''))
					res[key] = deviceConfig[key];
				return res;
			}, {});
			if (!device.id && !device.address && !device.mac)
				throw new Error('Device configuration must contain at least id, address, or mac');
			if (!device.model && device.mac && !device.name)
				this.warn("Device configuration for Bluetooth is missing 'model', device might not work correctly without a specific class.");
			return device;
		};
		getDeviceId(device) {
			return Device.getDeviceId(device);
		};
		truncate(str, maxLength=20) {
			if (!str || (typeof str === 'object'))
				return null;
			if (typeof str !== 'string')
				str = String(str);
			return (str.length > maxLength) ? str.slice(0, (maxLength - 3)) + '...' : str;
		};
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
		async #cleanup(deviceKey) {
			const device = this.devices.get(deviceKey);
			if (!device)
				return;
			this.debug(`Cleaning up and disconnecting device: ${deviceKey}`);
			await device.disconnect().catch(err => this.error(`Error during cleanup disconnect for ${deviceKey}: ${err}`));
			device.removeAllListeners();
			this.devices.delete(deviceKey);
			this.values.delete(deviceKey);
		};
		#connected(deviceKey) {
			if (this.disconnectTimers.has(deviceKey)) {
				clearTimeout(this.disconnectTimers.get(deviceKey));
				this.disconnectTimers.delete(deviceKey);
			}
			const device = this.devices.get(deviceKey);
			if (device) {
				this.status({ fill: 'green', shape: 'dot', text: `Connected: ${device.connectionType}` });
				this.send([null, {
					_msgid: RED.util.generateId(),
					topic: `connection/${deviceKey}/connected`,
					payload: {
						event: 'connected',
						connectionType: device.connectionType
					},
					device: device.config
				}]);
			}
		};
		#disconnect(deviceKey, ms = 200) {
			const text = this.values.get(deviceKey) || 'Disconnected';
			if (this.devices.has(deviceKey))
				this.disconnectTimers.set(deviceKey, setTimeout(() => {
					this.status({ fill: 'grey', shape: 'ring', text });
					const device = this.devices.get(deviceKey);
					if (device) {
						this.send([null, {
							_msgid: RED.util.generateId(),
							topic: `connection/${deviceKey}/disconnected`,
							payload: { event: 'disconnected' },
							device: device.config
						}]);
						this.#cleanup(deviceKey);
					}
					this.disconnectTimers.delete(deviceKey);
				}, ms));
		};
		#reconnecting(deviceKey, {reason}) {
			if (this.disconnectTimers.has(deviceKey)) {
				clearTimeout(this.disconnectTimers.get(deviceKey));
				this.disconnectTimers.delete(deviceKey);
			}
			const device = this.devices.get(deviceKey);
			if (device) {
				this.status({ fill: 'yellow', shape: 'dot', text: `Reconnecting` });
				this.send([null, {
					_msgid: RED.util.generateId(),
					topic: `connection/${deviceKey}/reconnecting`,
					payload: {
						event: 'reconnecting',
						reason
					},
					device: device.config
				}]);
			}
		};
		#reconnectFailed(deviceKey, {attempts, error}) {
			if (this.disconnectTimers.has(deviceKey)) {
				clearTimeout(this.disconnectTimers.get(deviceKey));
				this.disconnectTimers.delete(deviceKey);
			}
			const device = this.devices.get(deviceKey);
			if (device) {
				this.status({ fill: 'red', shape: 'ring', text: `Reconnect failed` });
				this.send([null, {
					_msgid: RED.util.generateId(),
					topic: `connection/${deviceKey}/reconnect_failed`,
					payload: {
						event: 'reconnect_failed',
						attempts, error
					},
					device: device.config
				}]);
				this.#cleanup(deviceKey);
			}
		};
		async #input(msg, send, done) {
			let result, device, deviceConfig, deviceKey;
			this.status({ fill: 'blue', shape: 'dot', text: 'Getting device...' });
			const topic = RED.util.evaluateNodeProperty(this.config.topic, this.config.topicType, this, msg);
			const value = RED.util.evaluateNodeProperty(this.config.value, this.config.valueType, this, msg);
			const property = RED.util.evaluateNodeProperty(this.config.property, this.config.propertyType, this, msg);
			const formattedProperty = this.formatPropertyForStatus(property);
			try {
				deviceConfig = this.getDeviceConfig(msg);
				deviceKey = this.getDeviceId(deviceConfig);
				if (this.disconnectTimers.has(deviceKey)) {
					this.debug(`Cancelling pending disconnect for ${deviceKey} due to new command.`);
					clearTimeout(this.disconnectTimers.get(deviceKey));
					this.disconnectTimers.delete(deviceKey);
				}
				if (!['getProperties', 'getProperty', 'setProperty', 'subscribe', 'unsubscribe'].includes(this.config.action))
					throw new Error(`Invalid action specified: ${this.config.action}`);
				if ((this.config.action !== 'getProperties') && !property)
					throw new Error('Property name is missing (configure node or provide msg.property)');
				if (this.devices.has(deviceKey)) {
					device = this.devices.get(deviceKey);
					this.debug(`Using existing device instance for key: ${deviceKey}`);
				} else {
					device = await this.client.getDevice(deviceConfig);
					device.on('connected', this.#connected.bind(this, deviceKey));
					device.on('disconnect', this.#disconnect.bind(this, deviceKey));
					device.on('reconnecting', this.#reconnecting.bind(this, deviceKey));
					device.on('reconnect_failed', this.#reconnectFailed.bind(this, deviceKey));
					this.devices.set(deviceKey, device);
					this.debug(`Created and stored new device instance for key: ${deviceKey}`);
				}
				if (this.config.action !== 'unsubscribe') {
					this.status({ fill: 'blue', shape: 'dot', text: `Connecting (${this.client.connectionType || 'auto'})...` });
					await device.connect();
				}
				this.debug(`Action: ${this.config.action}, Property: ${property}`);
				switch (this.config.action) {
					case 'getProperties':
					case 'getProperty': {
						this.status({ fill: 'blue', shape: 'dot', text: `Getting ${formattedProperty}...` });
						const payload = this.config.action === 'getProperties' ? await device.getProperties() : await device.getProperty(property);
						this.debug(`Got property/ies: ${JSON.stringify(payload)}`);
						msg.payload = payload;
						msg.topic = topic || msg.topic || `property/${(this.config.action === 'getProperties') ? '' : property}`;
						msg.text = this.formatPropertyForStatus(payload);
						send([msg, null]);
						this.values.set(deviceKey, msg.text);
						this.status({ fill: 'green', shape: 'dot', text: msg.text });
						break;
					};
					case 'setProperty': {
						this.status({ fill: 'blue', shape: 'dot', text: `Setting ${formattedProperty}...` });
						this.debug(`Value to set for ${property}: ${JSON.stringify(value)}`);
						await device.setProperty(property, value);
						this.log(`Property ${property} set to ${JSON.stringify(value)} successfully.`);
						this.status({ fill: 'green', shape: 'dot', text: 'Done' });
					};
					case 'subscribe': {
						this.status({ fill: 'yellow', shape: 'dot', text: `Subscribing to ${formattedProperty}...` });
						const subscriptionKey = `${deviceKey}_${formattedProperty}`;
						if (this.subscriptions.has(subscriptionKey)) {
							this.warn(`Already subscribed to ${property} for device ${deviceKey}. Ignoring.`);
							this.status({ fill: 'yellow', shape: 'ring', text: `Subscribed: ${property}` });
						}else{
							const callback = payload => {
								this.debug(`Notification received for ${property}: ${JSON.stringify(payload)}`);
								send([{
									_msgid: RED.util.generateId(),
									payload, property,
									device: deviceConfig,
									topic: topic || msg.topic || `notify/${property}`
								}, null]);
								this.status({ fill: 'yellow', shape: 'ring', text: `Subscribed: ${property}` });
							};
							this.subscriptions.set(subscriptionKey, { device, property, callback });
							await device.startNotify(property, callback);
							this.log(`Successfully subscribed to ${property} for device ${deviceKey}`);
							this.status({ fill: 'yellow', shape: 'ring', text: `Subscribed: ${property}` });
						}
						break;
					};
					case 'unsubscribe': {
						this.status({ fill: 'blue', shape: 'dot', text: `Unsubscribing from ${formattedProperty}...` });
						const subscriptionKey = `${deviceKey}_${formattedProperty}`;
						if (this.subscriptions.has(subscriptionKey)) {
							const subscription = this.subscriptions.get(subscriptionKey);
							await subscription.device.stopNotify(subscription.property);
							this.subscriptions.delete(subscriptionKey);
							this.log(`Successfully unsubscribed from ${property} for device ${deviceKey}`);
							this.status({ fill: 'grey', shape: 'ring', text: `Unsubscribed` });
						} else {
							this.warn(`Not subscribed to ${property} for device ${deviceKey}. Cannot unsubscribe.`);
							this.status({});
						}
					};
				};
			} catch (err) {
				result = err;
				msg.error = err;
				msg.code = err.code || 'unknown';
				msg.payload = err.message || 'Unknown error';
				msg.device = deviceConfig;
				this.status({ fill: 'red', shape: 'ring', text: 'Error' });
				if (deviceKey)
					send([null, {
						_msgid: msg._msgid,
						topic: `error/${deviceKey}`,
						payload: {
							event: 'error',
							error: err.message,
							action: this.config.action,
							sourceMessage: msg
						}
					}]);
			} finally {
				if (device && (this.config.action !== 'subscribe'))
					this.#disconnect(deviceKey, ((this.config.action === 'unsubscribe') ? 0 : 30_000));
			}
			done(result);
		};
		async #close(removed, done) {
			const cleanupPromises = [];
			this.debug(`Node closing, cleaning up all active connections and subscriptions... (removed: ${!!removed})`);
			for (const timerId of this.disconnectTimers.values()) {
				clearTimeout(timerId);
			}
			for (const [key, device] of this.devices.entries()) {
				this.debug(`Disconnecting device instance for key: ${key}`);
				cleanupPromises.push(
					device.disconnect().catch(err => this.error(`Error during cleanup disconnect for ${key}: ${err}`))
				);
			}
			try {
				await Promise.all(cleanupPromises);
				this.log('All active device connections closed.');
			} catch (err) {
				this.error('Error during connection cleanup on node close.');
			}
			this.disconnectTimers.clear();
			this.subscriptions.clear();
			this.devices.clear();
			this.values.clear();
			this.status({});
			done();
		};
	});
};
