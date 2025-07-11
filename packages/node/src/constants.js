export const LOG_LEVELS = {
	none: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4
};
export const DEFAULT_LOG_LEVEL = 'none';
export const LIB_ID = 'xmihome';
export const UUID = ['0000fe95-0000-1000-8000-00805f9b34fb', '0000181b-0000-1000-8000-00805f9b34fb'];
export const NOTIFY_POLLING_INTERVAL = 5_000;
export const RECONNECT_INITIAL_DELAY = 2_000;
export const RECONNECT_MAX_DELAY = 30_000;
export const RECONNECT_FACTOR = 1.5;
export const RECONNECT_MAX_ATTEMPTS_SHORT = 5;
export const RECONNECT_MAX_ATTEMPTS_LONG = 3;
export const GET_DEVICE_DISCOVERY_TIMEOUT = 20_000;
export const CACHE_TTL = 5 * 60_1000;
