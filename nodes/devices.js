export default function(RED) {
	RED.nodes.registerType('xmihome-devices', class Devices {
		constructor(config) {
			RED.nodes.createNode(this, config);
			this.settings = RED.nodes.getNode(config.settings);
			this.config = config;
			this.on('input', this.input.bind(this));
			this.status({});
		};
		async input(msg, send, done) {
			this.status({ fill: 'blue', shape: 'dot', text: 'Refreshing...' });
			try {
				if (!this.settings)
					throw new Error('Client is not initialized. Check configuration.');
				msg.payload = await this.settings.getDevices(true, this.config.timeout);
				if (!msg.payload?.length)
					this.status({ fill: 'yellow', shape: 'ring', text: 'No devices' });
				else
					this.status({ fill: 'green', shape: 'dot', text: `Devices: ${msg.payload.length}` });
				send(msg);
				done();
			} catch (error) {
				msg.error = error;
				msg.code = error.code || 'unknown';
				msg.payload = error.message || 'Unknown error';
				this.status({ fill: 'red', shape: 'ring', text: 'Error' });
				done(error);
			}
		};
	});
};
