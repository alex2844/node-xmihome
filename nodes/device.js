export default function(RED) {
	RED.nodes.registerType('xmihome-device', class Device {
		constructor(config) {
			RED.nodes.createNode(this, config);
			this.settings = RED.nodes.getNode(config.settings);
			this.config = config;
			this.subscriptions = new Map();
			console.log({
				config: this.config,
				settings: this.settings
			});
			this.on('input', this.input.bind(this));
			this.on('close', this.close.bind(this));
			this.status({});
		};
		get client() {
			if (!this.settings)
				throw new Error('Client is not initialized. Check configuration.');
			return this.settings.client;
		};
		getDevice(msg) {
			const keys = ['id', 'name', 'address', 'mac', 'token', 'model'];
			const device = RED.util.evaluateNodeProperty(this.config.device, this.config.deviceType, this, msg);
			if (!device || (typeof device !== 'object'))
                throw new Error('device is missing or not an object');
			Object.keys(device).forEach(key => {
				if (!keys.includes(key) || (device[key] == null) || (device[key] === ''))
					delete device[key]
			});
			if (!device.id && !device.address && !device.mac)
				throw new Error('device must contain at least id, address/token, or mac');
            if (!device.model && device.mac && !device.name)
				this.warn("device for Bluetooth is missing 'model', device might not work correctly without a specific class.");
			return device;
		};
		getDeviceKey(device) {
			return device.mac || device.address || device.id || JSON.stringify(device);
		};
		truncate(str, maxLength=20) {
			if (!str || (typeof str === 'object'))
				return null;
			if (typeof str !== 'string')
				str = String(str);
			return (str.length > maxLength) ? str.slice(0, (maxLength - 3)) + '...' : str;
		};
		async input(msg, send, done) {
			try {
				this.status({ fill: 'blue', shape: 'dot', text: 'Getting device...' });

				const topic = RED.util.evaluateNodeProperty(this.config.topic, this.config.topicType, this, msg);
				const value = RED.util.evaluateNodeProperty(this.config.value, this.config.valueType, this, msg);
				const property = RED.util.evaluateNodeProperty(this.config.property, this.config.propertyType, this, msg);
				if (!property || !['getProperties', 'getProperty', 'setProperty', 'subscribe', 'unsubscribe'].includes(this.config.action))
					throw new Error("Property name is missing (configure node or provide msg.property)");

				const dev = this.getDevice(msg);
				const device = await this.client.getDevice(dev);
				this.debug(`Got device instance: ${device.constructor.name}`);

				// TODO: Оптимизировать - не подключаться каждый раз, если уже подключено.
				// Пока простой вариант: всегда подключаемся.
				if (this.config.action !== 'unsubscribe') {
					this.status({ fill: 'blue', shape: 'dot', text: `Connecting (${this.client.connectionType || 'auto'})...` });
					await device.connect();
					this.debug(`Device connected via ${device.connectionType}`);
				}
				this.debug(`Action: ${this.config.action}, Property: ${property}`);
				switch (this.config.action) {
					case 'getProperties': {
						this.status({ fill: 'blue', shape: 'dot', text: `Getting...` });
						const payload = await device.getProperties();
						this.debug(`Got property ${property}: ${JSON.stringify(payload)}`);
						msg.payload = payload;
						msg.topic = topic || msg.topic || `property/`;
						send(msg);
						this.status({ fill: 'green', shape: 'dot', text: 'Done' });
						break;
					};
					case 'getProperty': {
						this.status({ fill: 'blue', shape: 'dot', text: `Getting ${property}...` });
						const payload = await device.getProperty(property);
						this.debug(`Got property ${property}: ${JSON.stringify(payload)}`);
						msg.payload = payload;
						msg.topic = topic || msg.topic || `property/${property}`;
						if (payload && (typeof payload === 'object') && !Array.isArray(payload)) {
							const keys = Object.keys(payload);
							if (keys.length > 3)
								msg.text = `${keys.length} fields, includes: ${keys.slice(0, 2).join(', ')}...`;
							else
								msg.text = Object.entries(payload).map(([key, value]) => `${key}: ${this.truncate(value, 10)}`).join(' | ');
						}else
							msg.text = this.truncate(payload);
						send(msg);
						this.status({ fill: 'green', shape: 'dot', text: (msg.text || 'Done') });
						break;
					};
					case 'setProperty': {
						this.status({ fill: "blue", shape: "dot", text: `Setting ${property}...` });
						this.debug(`Value to set for ${property}: ${JSON.stringify(value)}`);
						await device.setProperty(property, value);
						this.log(`Property ${property} set to ${JSON.stringify(value)} successfully.`);
						this.status({ fill: 'green', shape: 'dot', text: 'Done' });
					};
					case 'subscribe': { // TODO: когда поднял чайник, и затем поставил, не произошло переподключение
						this.status({ fill: "yellow", shape: "dot", text: `Subscribing to ${property}...` });
						const deviceKey = this.getDeviceKey(dev);
						const subscriptionKey = `${deviceKey}_${property}`;
						if (this.subscriptions.has(subscriptionKey)) {
							this.warn(`Already subscribed to ${property} for device ${deviceKey}. Ignoring.`);
							this.status({ fill: "yellow", shape: "ring", text: `Subscribed: ${property}` });
						}else{
							const callback = payload => {
								this.debug(`Notification received for ${property}: ${JSON.stringify(value)}`);
								const notifyMsg = RED.util.cloneMessage(msg);
								delete notifyMsg._msgid; // Удаляем старый ID
								notifyMsg.payload = payload;
								notifyMsg.topic = topic || msg.topic || `notify/${property}`;
								notifyMsg.device = dev;
								notifyMsg.property = property;
								send(notifyMsg);
								this.status({ fill: "yellow", shape: "ring", text: `Subscribed: ${property}` });
							};

							const subscriptionInfo = {
								device, property, callback,
								stopNotify: null
							};
							this.subscriptions.set(subscriptionKey, subscriptionInfo);

							try {
								await device.startNotify(property, callback);
								subscriptionInfo.stopNotify = async () => {
									try {
										await device.stopNotify(property);
										this.log(`Successfully stopped notifications for ${property} on ${deviceKey}`);
									} catch(stopErr) {
										this.error(`Error stopping notifications for ${property} on ${deviceKey}: ${stopErr}`, msg);
									}
								};
								this.log(`Successfully subscribed to ${property} for device ${deviceKey}`);
								this.status({ fill: "yellow", shape: "ring", text: `Subscribed: ${property}` });
							} catch(subError) {
								this.error(`Failed to subscribe to ${property}: ${subError}`, msg);
								this.subscriptions.delete(subscriptionKey);
								this.status({ fill: "red", shape: "ring", text: "Subscribe failed" });
								done(subError);
								return;
							}
						}
						break;
					};
					// case 'unsubscribe': {} // TODO
				};
				if (this.config.action !== 'subscribe')
					await device.disconnect();
				done();
			} catch (error) {
				msg.error = error;
				msg.code = error.code || 'unknown';
				msg.payload = error.message || 'Unknown error';
				this.status({ fill: 'red', shape: 'ring', text: 'Error' });
				done(error);
			}
		};
		async close() {
			this.debug("Node closing, cleaning up subscriptions...");
			const cleanupPromises = [];
			for (const [key, subInfo] of this.subscriptions.entries()) {
				this.debug(`Stopping subscription: ${key}`);
				if (subInfo.stopNotify)
					cleanupPromises.push(
						subInfo.stopNotify().catch(err => this.error(`Error during cleanup stopNotify for ${key}: ${err}`))
					);
			}
			try {
				await Promise.all(cleanupPromises);
				this.log("All active subscriptions stopped.");
			} catch (error) {
				this.error("Error during subscription cleanup on node close.");
			}
			this.subscriptions.clear();
			this.status({});
		};
	});
};
