import Device from '../device.mjs';

/**
 * Класс для управления умным увлажнителем Xiaomi Smart Humidifier 2 (deerma.humidifier.jsq2w).
 * @extends Device
 */
export default class extends Device {
	/**
	 * Название устройства.
	 * @static
	 * @type {string}
	 */
	static name = 'Xiaomi Smart Humidifier 2';

	/**
	 * Список поддерживаемых моделей устройств.
	 * @static
	 * @type {string[]}
	 */
	static models = [
		'deerma.humidifier.jsq2w'
	];

	/**
	 * Описание свойств устройства и их параметров для взаимодействия через MiIO.
	 * @static
	 * @type {object}
	 * @property {object} on Включение/выключение увлажнителя.
	 * @property {number} on.siid ID сервиса (Service ID).
	 * @property {number} on.piid ID свойства (Property ID).
	 * @property {string} on.format Формат данных ('bool').
	 * @property {string[]} on.access Типы доступа к свойству ([ 'read', 'write', 'notify' ]).
	 * @property {object} current_temperature Текущая температура.
	 * @property {number} current_temperature.siid ID сервиса.
	 * @property {number} current_temperature.piid ID свойства.
	 * @property {string} current_temperature.format Формат данных ('float').
	 * @property {string[]} current_temperature.access Типы доступа к свойству ([ 'read', 'notify' ]).
	 * @property {object} current_humidity Текущая влажность.
	 * @property {number} current_humidity.siid ID сервиса.
	 * @property {number} current_humidity.piid ID свойства.
	 * @property {string} current_humidity.format Формат данных ('uint8').
	 * @property {string[]} current_humidity.access Типы доступа к свойству ([ 'read', 'notify' ]).
	 * @property {object} target_humidity Целевая влажность.
	 * @property {number} target_humidity.siid ID сервиса.
	 * @property {number} target_humidity.piid ID свойства.
	 * @property {string} target_humidity.format Формат данных ('uint8').
	 * @property {string[]} target_humidity.access Типы доступа к свойству ([ 'read', 'write', 'notify' ]).
	 * @property {object} fault Код ошибки.
	 * @property {number} fault.siid ID сервиса.
	 * @property {number} fault.piid ID свойства.
	 * @property {string} fault.format Формат данных ('uint8').
	 * @property {string[]} fault.access Типы доступа к свойству ([ 'read', 'notify' ]).
	 * @property {object} fan_level Уровень вентилятора.
	 * @property {number} fan_level.siid ID сервиса.
	 * @property {number} fan_level.piid ID свойства.
	 * @property {string} fan_level.format Формат данных ('uint8').
	 * @property {string[]} fan_level.access Типы доступа к свойству ([ 'read', 'write', 'notify' ]).
	 * @property {object} mode Режим работы.
	 * @property {number} mode.siid ID сервиса.
	 * @property {number} mode.piid ID свойства.
	 * @property {string} mode.format Формат данных ('uint8').
	 * @property {string[]} mode.access Типы доступа к свойству ([ 'read', 'write', 'notify' ]).
	 * @property {object} status Статус устройства.
	 * @property {number} status.siid ID сервиса.
	 * @property {number} status.piid ID свойства.
	 * @property {string} status.format Формат данных ('uint8').
	 * @property {string[]} status.access Типы доступа к свойству ([ 'read', 'notify' ]).
	 */
	static properties = {
		'on': { siid: 2, piid: 1, format: 'bool', access: [ 'read', 'write', 'notify' ] },
		'current_temperature': { siid: 3, piid: 7, format: 'float', access: [ 'read', 'notify' ] },
		'current_humidity': { siid: 3, piid: 1, format: 'uint8', access: [ 'read', 'notify' ] },
		'target_humidity': { siid: 2, piid: 6, format: 'uint8', access: [ 'read', 'write', 'notify' ] },
		'fault': { siid: 2, piid: 2, format: 'uint8', access: [ 'read', 'notify' ] },
		'fan_level': { siid: 2, piid: 5, format: 'uint8', access: [ 'read', 'write', 'notify' ] },
		'mode': { siid: 2, piid: 8, format: 'uint8', access: [ 'read', 'write', 'notify' ] },
		'status': { siid: 2, piid: 7, format: 'uint8', access: [ 'read', 'notify' ] }
	};
};
