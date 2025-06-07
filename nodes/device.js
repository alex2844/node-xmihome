import Device from '../lib/device.js';

export default function(RED) {
	RED.nodes.registerType('xmihome-device', class DeviceNode {
		constructor(config) {
			RED.nodes.createNode(this, config);
			this.settings = RED.nodes.getNode(config.settings);
			this.config = config;
			this.devices = new Map();
			this.subscriptions = new Map();
			this.connectionTimeouts = new Map();
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
		async #input(msg, send, done) {
			let result;
			let device;
			this.status({ fill: 'blue', shape: 'dot', text: 'Getting device...' });
			const topic = RED.util.evaluateNodeProperty(this.config.topic, this.config.topicType, this, msg);
			const value = RED.util.evaluateNodeProperty(this.config.value, this.config.valueType, this, msg);
			const property = RED.util.evaluateNodeProperty(this.config.property, this.config.propertyType, this, msg);
			const deviceConfig = this.getDeviceConfig(msg);
			const deviceKey = this.getDeviceId(deviceConfig);
			if (this.connectionTimeouts.has(deviceKey)) {
				clearTimeout(this.connectionTimeouts.get(deviceKey));
				this.connectionTimeouts.delete(deviceKey);
			}
			try {
				if (!property || !['getProperties', 'getProperty', 'setProperty', 'subscribe', 'unsubscribe'].includes(this.config.action))
					throw new Error('Property name is missing (configure node or provide msg.property)');
				if (this.devices.has(deviceKey)) {
					device = this.devices.get(deviceKey);
					this.debug(`Using existing device instance for key: ${deviceKey}`);
				} else {
					device = await this.client.getDevice(deviceConfig);
					this.devices.set(deviceKey, device);
					this.debug(`Created and stored new device instance for key: ${deviceKey}`);
				}
				if (this.config.action !== 'unsubscribe') {
					this.status({ fill: 'blue', shape: 'dot', text: `Connecting (${this.client.connectionType || 'auto'})...` });
					await device.connect();
					this.status({ fill: 'green', shape: 'dot', text: `Connected: ${device.connectionType}` });
				}
				this.debug(`Action: ${this.config.action}, Property: ${property}`);
				switch (this.config.action) {
					case 'getProperties':
					case 'getProperty': {
						this.status({ fill: 'blue', shape: 'dot', text: `Getting ${property || 'all'}...` });
						const payload = this.config.action === 'getProperties' ? await device.getProperties() : await device.getProperty(property);
						this.debug(`Got property/ies: ${JSON.stringify(payload)}`);
						msg.payload = payload;
						msg.text = 'Done';
						if (this.config.action === 'getProperty') {
							msg.topic = topic || msg.topic || `property/${property}`;
							if (payload && (typeof payload === 'object') && !Array.isArray(payload)) {
								const keys = Object.keys(payload);
								if (keys.length > 3)
									msg.text = `${keys.length} fields, includes: ${keys.slice(0, 2).join(', ')}...`;
								else
									msg.text = Object.entries(payload).map(([key, value]) => `${key}: ${this.truncate(value, 10)}`).join(' | ');
							}else
								msg.text = this.truncate(payload);
						}else
							msg.topic = topic || msg.topic || `property/`;
						send(msg);
						this.status({ fill: 'green', shape: 'dot', text: msg.text });
						break;
					};
					case 'setProperty': {
						this.status({ fill: 'blue', shape: 'dot', text: `Setting ${property}...` });
						this.debug(`Value to set for ${property}: ${JSON.stringify(value)}`);
						await device.setProperty(property, value);
						this.log(`Property ${property} set to ${JSON.stringify(value)} successfully.`);
						this.status({ fill: 'green', shape: 'dot', text: 'Done' });
					};
					case 'subscribe': {
						this.status({ fill: 'yellow', shape: 'dot', text: `Subscribing to ${property}...` });
						const subscriptionKey = `${deviceKey}_${property}`;
						if (this.subscriptions.has(subscriptionKey)) {
							this.warn(`Already subscribed to ${property} for device ${deviceKey}. Ignoring.`);
							this.status({ fill: 'yellow', shape: 'ring', text: `Subscribed: ${property}` });
						}else{
							const callback = payload => {
								this.debug(`Notification received for ${property}: ${JSON.stringify(value)}`);
								send({
									_msgid: RED.util.generateId(),
									payload, property,
									device: deviceConfig,
									topic: topic || msg.topic || `notify/${property}`
								});
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
						this.status({ fill: 'blue', shape: 'dot', text: `Unsubscribing from ${property}...` });
						const subscriptionKey = `${deviceKey}_${property}`;
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
				this.status({ fill: 'red', shape: 'ring', text: 'Error' });
			} finally {
				if (this.config.action !== 'subscribe')
					this.connectionTimeouts.set(deviceKey, setTimeout(() => {
						this.debug(`Auto-disconnecting device ${deviceKey} due to inactivity.`);
						device.disconnect().catch(err => this.error(`Error during auto-disconnect for ${deviceKey}: ${err.message}`));
						this.devices.delete(deviceKey);
						this.connectionTimeouts.delete(deviceKey);
					}, 30_000));
			}
			done(result);
		};
		async #close(removed, done) {
			const cleanupPromises = [];
			this.debug(`Node closing, cleaning up all active connections and subscriptions... (removed: ${!!removed})`);
			for (const timeoutId of this.connectionTimeouts.values()) {
				clearTimeout(timeoutId);
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
			this.connectionTimeouts.clear();
			this.subscriptions.clear();
			this.devices.clear();
			this.status({});
			done();
		};
	});
};
