import Device from 'xmihome/device.js';
/** @import { Property, UuidMapping } from 'xmihome/device.js' */

/**
 * Класс для управления датчиком температуры и влажности Miaomiaoce Sensor HT.T8 (miaomiaoce.sensor_ht.t8).
 * @extends Device
 */
export default class extends Device {
	/**
	 * Название устройства.
	 * @type {string}
	 */
	static name = 'Temperature Humidity Sensor';

	/**
	 * Список альтернативных названий устройства (алиасов).
	 * @type {string[]}
	 */
	static alias = [
		'LYWSD02MMC'
	];

	/**
	 * Список поддерживаемых моделей устройств.
	 * @type {string[]}
	 */
	static models = [
		'miaomiaoce.sensor_ht.t8'
	];

	/**
	 * Описание свойств устройства и их параметров для взаимодействия через Bluetooth.
	 * @type {Object.<string, Property>}
	 * @property {Property} battery Уровень заряда батареи.
	 * @property {Property} time Время и временная зона устройства.
	 * @property {Property} status Статус (температура и влажность).
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

	/**
	 * Карта для преобразования полных 128-битных UUID в короткие 16-битные.
	 * @type {UuidMapping}
	 */
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
