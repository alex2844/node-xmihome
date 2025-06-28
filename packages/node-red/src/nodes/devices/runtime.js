/**
 * @import { Node, NodeAPI, NodeDef, NodeMessage } from 'node-red'
 * @import { NodeInstance as ConfigNodeInstance, ConfigNode } from '../config/runtime.js'
 */

/**
 * @typedef {{
 *   settings: string;
 *   timeout: number;
 * }} Config
 */
/** @typedef {NodeDef & Config} ConfigDef */

/** @typedef {Node & { instance: DevicesNode }} NodeInstance */

export class DevicesNode {
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
	 * @type {ConfigDef}
	 */
	#config;

	/**
	 * Экземпляр класса логики узла конфигурации.
	 * @type {ConfigNode}
	 */
	settings;

	/**
	 * @param {NodeInstance} node
	 * @param {ConfigDef} config
	 * @param {NodeAPI} RED
	 */
	constructor(node, config, RED) {
		this.#node = node;
		this.#config = config;

		const configNode = RED.nodes.getNode(this.#config.settings);
		if (configNode)
			this.settings = (/** @type {ConfigNodeInstance} */ (configNode)).instance;
		else
			this.#node.warn('Config node not found or configured.');
		this.#node.on('input', this.#input.bind(this));
	};

	/**
	 * @param {NodeMessage} msg
	 * @param {(...args: any[]) => void} send
	 * @param {(err?: Error) => void} done
	 */
	async #input(msg, send, done) {
		try {
			if (!this.settings)
				throw new Error('Client is not initialized. Check configuration.');
			this.#node.status({ fill: 'blue', shape: 'dot', text: 'Refreshing...' });
			msg.payload = await this.settings.getDevices(true, this.#config.timeout);
			if (Array.isArray(msg.payload) && msg.payload.length > 0)
				this.#node.status({ fill: 'green', shape: 'dot', text: `Devices: ${msg.payload.length}` });
			else
				this.#node.status({ fill: 'yellow', shape: 'ring', text: 'No devices' });
			send(msg);
			done();
		} catch (err) {
			this.#node.error(`Failed to get devices: ${err.message}`, msg);
			this.#node.status({ fill: 'red', shape: 'ring', text: 'Error' });
			done(err);
		}
	};
};

/**
 * @param {NodeAPI} RED
 */
export default function (RED) {
	RED.nodes.registerType('xmihome-devices', function (/** @type {ConfigDef} */ config) {
		RED.nodes.createNode(this, config);
		const node = /** @type {NodeInstance} */ (this);
		node.instance = new DevicesNode(node, config, RED);
	});
};
