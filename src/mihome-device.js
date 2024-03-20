module.exports = RED => {
	function Device(config) {
		RED.nodes.createNode(this, config);
		const settings = RED.nodes.getNode(config.settings);
		this.on('input', msg => {
			const id = RED.util.evaluateNodeProperty(config.deviceid, config.deviceidType, this, msg);
			const device = settings.getDevice(id, msg.payload);
			const method = RED.util.evaluateNodeProperty(config.method, config.methodType, this, msg);
			const params = RED.util.evaluateNodeProperty(config.params, config.paramsType, this, msg);
			const topic = RED.util.evaluateNodeProperty(config.topic, config.topicType, this, msg);
			settings.getClient().then(client => client.getDevice((device || { id }), method, params))
			.then(payload => this.send({
				...(topic && { topic }),
				payload
			}))
			.catch(({ message, code }) => this.error(message, { code }));
		});
	}
	RED.nodes.registerType('mihome-device', Device);
}
