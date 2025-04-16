import { XiaomiMiHome } from '../lib/index.js';

const CACHE_TTL = 5 * 60 * 1000;
const refreshPromises = new Map();

export default function(RED) {
	RED.nodes.registerType('xmihome-config', class Config {
		#client;
		deviceCache = {
			devices: [],
			timestamp: 0,
			error: null
		};
		constructor(config) {
			RED.nodes.createNode(this, config);
			RED.httpAdmin.get(`/xmihome/devices/${this.id}`, RED.auth.needsPermission('xmihome-config.read'), this.getDevicesHandler.bind(this));
			this.config = config;
			this.on('close', this.close.bind(this));
		};
		get client() {
			if (!this.#client)
				this.#client = new XiaomiMiHome({
					credentials: this.credentials,
					connectionType: this.config.connectionType === 'auto' ? null : this.config.connectionType,
					logLevel: this.config.debug ? 'debug' : 'none'
				});
			return this.#client;
		};
		async getDevicesHandler(req, res) {
			try {
				const devicesPromise = this.getDevices(req.query.force === 'true');
				await devicesPromise;
				res.json({
					devices: this.deviceCache.devices,
					loading: refreshPromises.has(this.id),
					error: this.deviceCache.error,
					timestamp: this.deviceCache.timestamp
				});
			} catch (err) {
				res.status(500).json({
					devices: this.deviceCache.devices,
					loading: false,
					error: err.message || 'Failed to refresh device list',
					timestamp: this.deviceCache.timestamp
				});
			}
		};
		async getDevices(force = false, timeout = undefined) {
			if (refreshPromises.has(this.id)) {
				this.debug('Device refresh already in progress, returning existing promise.');
				return refreshPromises.get(this.id);
			}
			const now = Date.now();
			if (!force && (this.deviceCache.devices.length > 0) && ((now - this.deviceCache.timestamp) < CACHE_TTL)) {
				this.debug('Using cached device list (TTL not expired).');
				return Promise.resolve(this.deviceCache.devices);
			}
			this.debug(`Initiating device cache refresh (force=${force})...`);
			this.deviceCache.error = null;
			const refreshPromise = (async () => {
				try {
					const devices = await this.client.getDevices({
						...(timeout && { timeout })
					});
					this.deviceCache.devices = devices || [];
					this.deviceCache.timestamp = Date.now();
					this.log(`Device cache refreshed. Found ${this.deviceCache.devices.length} devices.`);
					return this.deviceCache.devices;
				} catch (err) {
					this.error(`Failed to refresh device cache: ${err.message}`, err);
					this.deviceCache.error = err.message || 'Unknown error';
					throw err;
				} finally {
					refreshPromises.delete(this.id);
					this.debug('Refresh promise removed.');
				}
			})();
			refreshPromises.set(this.id, refreshPromise);
			this.debug('Refresh promise created and stored.');
			return refreshPromise;
		};
		async close(removed) {
			this.debug(`Closing config node ${this.id} (removed: ${!!removed})`);
			refreshPromises.delete(this.id);

			const endpointPath = '/xmihome/devices/' + this.id;
			const routes = RED.httpAdmin._router.stack;
			for (let i = routes.length - 1; i >= 0; i--) {
				if (routes[i].route && (routes[i].route.path === endpointPath)) {
					routes.splice(i, 1);
					this.debug(`Removed HTTP admin route: ${endpointPath}`);
					break;
				}
			}

			if (this.#client)
				try {
					await this.#client.destroy();
					this.log('XiaomiMiHome client destroyed.');
				} catch (err) {
					this.error(`Error destroying client: ${err.message}`);
				} finally {
					this.#client = null;
				}
		};
	}, {
		credentials: {
			username: { type: 'text' },
			password: { type: 'password' },
			country: { type: 'text' }
		}
	});
};
