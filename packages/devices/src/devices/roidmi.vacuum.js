import Device from 'xmihome/device.js';
/** @import { Property, Action } from 'xmihome/device.js' */

/**
 * Класс для управления пылесосом ROIDMI EVE (roidmi.vacuum.v60).
 * @extends Device
 */
export default class RoidmiVacuum extends Device {
	/** @type {string} */
	static name = 'ROIDMI EVE';

	/** @type {string[]} */
	static models = [
		'roidmi.vacuum.v60'
	];

	/**
	 * @type {({
	 *   status: Property,
	 *   fault: Property,
	 *   mode: Property,
	 *   fan_level: Property,
	 *   water_level: Property,
	 *   mop_state: Property,
	 *   battery_level: Property,
	 *   charging_status: Property
	 * }) & { [x: string]: Property }}
	 * @property {Property} status - Статус работы (2: Уборка, 3: Пауза, 4: Ошибка, 5: Возврат на базу, 6: Зарядка).
	 * @property {Property} fault - Код ошибки устройства.
	 * @property {Property} mode - Режим работы пылесоса.
	 * @property {Property} fan_level - Уровень мощности всасывания (0: Тихий, 1: Стандартный, 2: Средний, 3: Турбо).
	 * @property {Property} water_level - Уровень подачи воды (101: Низкий, 102: Средний, 103: Высокий).
	 * @property {Property} mop_state - Состояние швабры/мопа.
	 * @property {Property} battery_level - Уровень заряда батареи в процентах.
	 * @property {Property} charging_status - Статус процесса зарядки (1: Заряжается, 2: Не заряжается).
	 */
	properties = {
		// Сервис: vacuum (siid: 2)
		'status': { siid: 2, piid: 1, format: 'uint8', access: ['read', 'notify'] },
		'fault': { siid: 2, piid: 2, format: 'uint8', access: ['read', 'notify'] },
		'mode': { siid: 2, piid: 4, format: 'uint8', access: ['read', 'write', 'notify'] },
		'fan_level': { siid: 2, piid: 6, format: 'uint8', access: ['read', 'write', 'notify'] },
		'water_level': { siid: 2, piid: 7, format: 'uint8', access: ['read', 'write', 'notify'] },
		'mop_state': { siid: 2, piid: 8, format: 'uint8', access: ['read', 'notify'] },
		// Сервис: battery (siid: 3)
		'battery_level': { siid: 3, piid: 1, format: 'uint8', access: ['read', 'notify'] },
		'charging_status': { siid: 3, piid: 2, format: 'uint8', access: ['read', 'notify'] },
	};

	/**
	 * Действия, которые можно выполнять с устройством.
	 * @type {({
	 *   start_sweep: Action,
	 *   stop_sweep: Action,
	 *   start_charge: Action
	 * }) & { [x: string]: Action }}
	 * @property {Action} start_sweep - Начать уборку.
	 * @property {Action} stop_sweep - Остановить/приостановить уборку.
	 * @property {Action} start_charge - Отправить на базу для зарядки.
	 */
	actions = {
		// Сервис: vacuum (siid: 2)
		'start_sweep': { siid: 2, aiid: 1 },
		'stop_sweep': { siid: 2, aiid: 2 },
		// Сервис: battery (siid: 3)
		'start_charge': { siid: 3, aiid: 1 }
	};
};
