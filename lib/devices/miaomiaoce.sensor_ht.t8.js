import {UUID} from '../constants.js';
import Device from '../device.js';

/**
 * Класс для управления датчиком температуры и влажности Miaomiaoce Sensor HT.T8 (miaomiaoce.sensor_ht.t8).
 * @extends Device
 */
export default class extends Device {
	/**
	 * Название устройства.
	 * @static
	 * @type {string}
	 */
	static name = 'Temperature Humidity Sensor';

	/**
	 * Список альтернативных названий устройства (алиасов).
	 * @static
	 * @type {string[]}
	 */
	static alias = [
		'LYWSD02MMC'
	];

	/**
	 * Список поддерживаемых моделей устройств.
	 * @static
	 * @type {string[]}
	 */
	static models = [
		'miaomiaoce.sensor_ht.t8'
	];

	/**
	 * Описание свойств устройства и их параметров для взаимодействия через Bluetooth.
	 * @static
	 * @type {object}
	 * @property {object} battery Уровень заряда батареи.
	 * @property {string} battery.service UUID сервиса Bluetooth.
	 * @property {string} battery.characteristic UUID характеристики Bluetooth.
	 * @property {function} battery.read Функция для чтения значения свойства из буфера.
	 * @property {object} time Время и временная зона устройства.
	 * @property {string} time.service UUID сервиса Bluetooth.
	 * @property {string} time.characteristic UUID характеристики Bluetooth.
	 * @property {function} time.read Функция для чтения значения свойства из буфера.
	 * @property {function} time.write Функция для записи значения свойства в буфер.
	 * @property {object} status Статус (температура и влажность).
	 * @property {string} status.service UUID сервиса Bluetooth.
	 * @property {string} status.characteristic UUID характеристики Bluetooth.
	 * @property {string[]} status.access Типы доступа к свойству ([ 'read', 'notify' ]).
	 * @property {function} status.read Функция для чтения значения свойства из буфера.
	 */
	static properties = {
		'battery': {
			service: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
			characteristic: 'ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6',
			read: buf => buf.readUInt8(0)
		},
		'time': {
			service: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
			characteristic: 'ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6',
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
			access: [ 'read', 'notify' ],
			read: buf => ({
				temp: buf.readUInt16LE(0) / 100,
				hum: buf.readUInt8(2)
			})
		}
	};

	/**
	 * Карта для преобразования полных 128-битных UUID в короткие 16-битные.
	 * @static
	 * @type {{services: Object.<string, string>, characteristics: Object.<string, string>}}
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
