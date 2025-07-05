import Device from 'xmihome/device.js';
/** @import { Property, UuidMapping } from 'xmihome/device.js' */

/**
 * Класс для управления датчиком температуры и влажности Miaomiaoce Sensor HT.T8 (miaomiaoce.sensor_ht.t8).
 * @extends Device
 */
export default class extends Device {
	/** @type {string} */
	static name = 'Temperature Humidity Sensor';

	/** @type {string[]} */
	static alias = [
		'LYWSD02MMC'
	];

	/** @type {string[]} */
	static models = [
		'miaomiaoce.sensor_ht.t8'
	];

	/**
	 * @typedef {Omit<Property, 'read'> & {
	 *   read: (buf: Buffer) => number
	 * }} BatteryProperty
	 */
	/**
	 * @typedef {Omit<Property, 'read'|'write'> & {
	 *   read: (buf: Buffer) => {timestamp: number, offset: number},
	 *   write: (data?: {timestamp?: number, offset?: number}) => Buffer
	 * }} TimeProperty
	 */
	/**
	 * @typedef {Omit<Property, 'read'> & {
	 *   read: (buf: Buffer) => {temp: number, hum: number}
	 * }} StatusProperty
	 */
	/**
	 * @type {({
	 *   battery: BatteryProperty,
	 *   time: TimeProperty,
	 *   status: StatusProperty
	 * }) & { [x: string]: Property }}
	 * @property {BatteryProperty} battery Уровень заряда батареи.
	 * @property {TimeProperty} time Время и временная зона устройства.
	 * @property {StatusProperty} status Статус (температура и влажность).
	 */
	static properties = {
		'battery': {
			service: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
			characteristic: 'ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6',
			access: ['read'],
			read: buf => buf.readUInt8(0)
		},
		'time': {
			service: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
			characteristic: 'ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6',
			access: ['read', 'write'],
			read: buf => ({
				timestamp: buf.readUInt32LE(0),
				offset: buf.readUInt8(4)
			}),
			write: ({ timestamp, offset } = {}) => {
				const buf = Buffer.alloc(5);
				if (timestamp)
					buf.writeUInt32LE(timestamp, 0);
				if (offset)
					buf.writeUInt8(offset, 4);
				return buf;
			}
		},
		'status': {
			service: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
			characteristic: 'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6',
			access: ['read', 'notify'],
			read: buf => ({
				temp: buf.readUInt16LE(0) / 100,
				hum: buf.readUInt8(2)
			})
		}
	};

	/** @type {UuidMapping} */
	static uuidMap = {
		services: {
			'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6': '001b'
		},
		characteristics: {
			'ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6': '0036',
			'ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6': '001c',
			'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6': '002f'
		}
	};
};
