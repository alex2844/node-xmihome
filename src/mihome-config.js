module.exports = RED => {
	const MiHome = require('./index.js');
	function Config(config) {
		RED.nodes.createNode(this, config);
		this.setDevices = function(devices) {
			if (JSON.stringify(this.credentials.devices) != JSON.stringify(devices)) {
				this.credentials.devices = devices;
				RED.nodes.addCredentials(this.id, this.credentials);
			}
			return this;
		}
		this.getDevices = function(devices) {
			return [].concat(this.credentials.devices, devices).filter(device => (device && (typeof(device) === 'object')));
		}
		this.getDevice = function(id, devices) {
			if (!id)
				return;
			return this.getDevices(devices).find(device => (device.id === id));
		}
		this.getClient = async function() {
			const client = new MiHome(this.credentials);
			client.on('login', credentials => RED.nodes.addCredentials(this.id, credentials));
			return client;
		}
	}
	RED.nodes.registerType('mihome-config', Config, {
		credentials: {
			username: { type: 'text' },
			password: { type: 'password' },
			country: { type: 'text' },
			devices: { type: 'text' },
			ssecurity: { type: 'text' },
			userId: { type: 'text' },
			serviceToken: { type: 'password' }
		}
	});
}
