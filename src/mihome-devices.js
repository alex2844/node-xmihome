module.exports = RED => {
	function Devices(config) {
		RED.nodes.createNode(this, config);
		const settings = RED.nodes.getNode(config.settings);
		this.on('input', msg => {
			settings.getClient().then(client => client.getDevices(settings.getDevices(msg.payload)))
			.then(payload => {
				if (msg.payload) {
					const devices = settings.getDevices();
					payload.forEach(({ id, token, address }) => {
						if (id && token && address) {
							const i = devices.findIndex(device => (device.id === id));
							if (i !== -1)
								devices[i] = { id, token, address };
							else
								devices.push({ id, token, address });
						}
					});
					settings.setDevices(devices);
				}
				return this.send({ payload });
			})
			.catch(({ message, code }) => this.error(message, { code }));
		});
	}
	RED.nodes.registerType('mihome-devices', Devices);
}
