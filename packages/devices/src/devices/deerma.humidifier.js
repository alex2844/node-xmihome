import Device from 'xmihome/device.js';
/** @import { Property } from 'xmihome/device.js' */

/**
 * Класс для управления умным увлажнителем Xiaomi Smart Humidifier 2 (deerma.humidifier.jsq2w).
 * @extends Device
 */
export default class DeermaHumidifier extends Device {
	/** @type {string} */
	static name = 'Xiaomi Smart Humidifier 2';

	/** @type {string[]} */
	static models = [
		'deerma.humidifier.jsq2w'
	];

	/**
	 * @type {({
	 *   on: Property,
	 *   current_temperature: Property,
	 *   current_humidity: Property,
	 *   target_humidity: Property,
	 *   fault: Property,
	 *   fan_level: Property,
	 *   mode: Property,
	 *   status: Property
	 * }) & { [x: string]: Property }}
	 * @property {Property} on Включение/выключение увлажнителя.
	 * @property {Property} current_temperature Текущая температура.
	 * @property {Property} current_humidity Текущая влажность.
	 * @property {Property} target_humidity Целевая влажность.
	 * @property {Property} fault Код ошибки.
	 * @property {Property} fan_level Уровень вентилятора.
	 * @property {Property} mode Режим работы.
	 * @property {Property} status Статус устройства.
	 */
	properties = {
		'on': { siid: 2, piid: 1, format: 'bool', access: ['read', 'write', 'notify'] },
		'current_temperature': { siid: 3, piid: 7, format: 'float', access: ['read', 'notify'] },
		'current_humidity': { siid: 3, piid: 1, format: 'uint8', access: ['read', 'notify'] },
		'target_humidity': { siid: 2, piid: 6, format: 'uint8', access: ['read', 'write', 'notify'] },
		'fault': { siid: 2, piid: 2, format: 'uint8', access: ['read', 'notify'] },
		'fan_level': { siid: 2, piid: 5, format: 'uint8', access: ['read', 'write', 'notify'] },
		'mode': { siid: 2, piid: 8, format: 'uint8', access: ['read', 'write', 'notify'] },
		'status': { siid: 2, piid: 7, format: 'uint8', access: ['read', 'notify'] }
	};
};
