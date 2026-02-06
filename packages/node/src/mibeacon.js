import crypto from 'crypto';
import { devices } from 'xmihome-devices/mibeacon.js';
/** @import Bluetooth from './bluetooth.js' */

/**
 * @typedef {Object} FrameControl
 * @property {boolean} isEncrypted Зашифрован ли пакет.
 * @property {boolean} hasMac Содержит ли пакет MAC-адрес.
 * @property {boolean} hasCapabilities Содержит ли пакет байт возможностей.
 * @property {boolean} hasObject Содержит ли пакет полезную нагрузку (данные).
 * @property {boolean} isMesh Является ли устройство Mesh-узлом.
 * @property {boolean} isRegistered Зарегистрировано ли устройство.
 * @property {boolean} isSolicited Требует ли устройство привязки (solicited).
 * @property {number} authMode Режим аутентификации (0, 1, 2).
 * @property {number} version Версия протокола MiBeacon (2-5).
 */

/**
 * @typedef {Object} MiBeaconResult
 * @property {number} ts Метка времени получения пакета.
 * @property {string} id Device ID в hex формате (например, '0x03bc').
 * @property {string} mac MAC-адрес устройства.
 * @property {string} uuid UUID сервиса.
 * @property {string} type Название модели устройства.
 * @property {FrameControl} frameControl Флаги заголовка пакета.
 * @property {string} firmware Версия протокола.
 * @property {Object} [payload] Распаршенные данные (температура, влажность и т.д.).
 * @property {string[]} [objectIds] Список ID объектов, найденных в пакете (например, ['0x1004', '0x1006']).
 */

/**
 * Класс-парсер для рекламных пакетов Xiaomi MiBeacon.
 * Порт: https://github.com/custom-components/ble_monitor/blob/master/custom_components/ble_monitor/ble_parser/xiaomi.py
 */
export default class MiBeacon {
	/** @type {Bluetooth} */ #bluetooth;
	/** @type {string} */ #mac;
	/** @type {Buffer|undefined} */ #key;
	/** @type {string} */ #uuid;
	/** @type {Buffer} */ #data;

	/**
	 * Конструктор класса MiBeacon.
	 * @param {Bluetooth} bluetooth Экземпляр класса Bluetooth.
	 * @param {string} device Имя устройства из D-Bus (dev_XX_XX...).
	 * @param {Buffer} data Сырые данные рекламного пакета (Service Data).
	 * @param {string} uuid UUID сервиса.
	 */
	constructor(bluetooth, device, data, uuid) {
		this.#bluetooth = bluetooth;
		this.#mac = device.replace('dev_', '').replace(/_/g, ':');
		this.#key = bluetooth.bindKeys.get(this.#mac);
		this.#uuid = uuid;
		this.#data = data;
	};

	get client() {
		return this.#bluetooth.client;
	};

	/**
	 * Выполняет разбор пакета.
	 * @returns {MiBeaconResult|null} Результат разбора или null, если пакет некорректен.
	 */
	parse() {
		if (this.#data.length < 5)
			return null;

		const frameCounter = this.#data[4];
		const frameControl = this.#parseFrameControl();
		if (frameControl.version < 2) {
			this.client?.log('debug', `MiBeacon: version ${frameControl.version} not supported.`);
			return null;
		}

		const id = this.#data.readUInt16LE(2);
		const type = devices[id];

		const result = {
			ts: Date.now(),
			id: `0x${id.toString(16).padStart(4, '0')}`,
			mac: this.#mac,
			uuid: this.#uuid,
			type, frameControl,
			firmware: `MiBeacon v${frameControl.version}`
		};

		let payloadOffset = 5;
		if (frameControl.hasMac) {
			if (this.#data.length < payloadOffset + 6)
				return null;
			payloadOffset += 6;
		}

		if (frameControl.hasCapabilities) {
			payloadOffset += 1;
			if (this.#data.length > payloadOffset && (this.#data[payloadOffset - 1] & 0x20))
				payloadOffset += 1;
		}
		if (!frameControl.hasObject)
			return null;

		let payload = this.#data.subarray(payloadOffset);
		if (frameControl.isEncrypted) {
			result.firmware += ' encrypted';
			if (!this.#key)
				return null;
			payload = this.#decrypt(payload, id, frameCounter);
		}
		if (!payload)
			return null;
		const { objectIds, data } = this.#parseObjects(payload, type) || {};
		if (!data)
			return null;
		return {
			...result,
			objectIds,
			payload: data
		};
	};

	/**
	 * @returns {FrameControl}
	 */
	#parseFrameControl() {
		const fc = this.#data.readUInt16LE(0);
		return {
			isEncrypted: !!(fc & (1 << 3)),
			hasMac: !!(fc & (1 << 4)),
			hasCapabilities: !!(fc & (1 << 5)),
			hasObject: !!(fc & (1 << 6)),
			isMesh: !!(fc & (1 << 7)),
			isRegistered: !!(fc & (1 << 8)),
			isSolicited: !!(fc & (1 << 9)),
			authMode: (fc >> 10) & 3,
			version: fc >> 12,
		};
	};

	/**
	 * Выполняет расшифровку зашифрованных данных пакета (V4/V5) через AES-128-CCM.
	 * @param {Buffer} encryptedData Данные для расшифровки.
	 * @param {number} id Product ID устройства.
	 * @param {number} frameCounter Счетчик кадров из пакета.
	 * @returns {Buffer|null} Расшифрованный Buffer или null при ошибке.
	 */
	#decrypt(encryptedData, id, frameCounter) {
		if (encryptedData.length < 7)
			return null;

		const nonce = Buffer.alloc(12);
		const macBuffer = Buffer.from(this.#mac.replace(/:/g, ''), 'hex').reverse();

		macBuffer.copy(nonce, 0);
		nonce.writeUInt16LE(id, 6);
		nonce.writeUInt8(frameCounter, 8);

		const counterExt = encryptedData.subarray(encryptedData.length - 7, encryptedData.length - 4);
		counterExt.copy(nonce, 9);

		const mic = encryptedData.subarray(-4);
		const ciphertext = encryptedData.subarray(0, -7);
		try {
			const decipher = crypto.createDecipheriv('aes-128-ccm', this.#key, nonce, {
				authTagLength: 4
			});
			decipher.setAuthTag(mic);
			decipher.setAAD(Buffer.from([0x11]), { plaintextLength: ciphertext.length });
			return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		} catch (error) {
			this.client?.log?.('debug', `Decryption error: ${error.message}`);
			return null;
		}
	};

	/**
	 * Разбирает полезную нагрузку пакета на объекты.
	 * @param {Buffer} payload Буфер с объектами данных.
	 * @param {string} type Тип устройства (название модели).
	 * @returns {{ data: Object, objectIds: string[] } | null}
	 */
	#parseObjects(payload, type) {
		const data = {};
		const objectIds = [];
		let offset = 0;

		while (offset < payload.length) {
			if (offset + 3 > payload.length)
				break;

			const typeId = payload.readUInt16LE(offset);
			const len = payload[offset + 2];

			if (offset + 3 + len > payload.length)
				break;

			const objectData = payload.subarray(offset + 3, offset + 3 + len);
			offset += 3 + len;

			const hexId = `0x${typeId.toString(16).padStart(4, '0')}`;
			const parser = MiBeacon.#objectParsers[typeId];
			if (parser) {
				objectIds.push(hexId);
				Object.assign(data, parser(objectData, type));
			} else {
				this.client?.log('debug', `MiBeacon: Unknown object ${hexId}: ${objectData.toString('hex')}`);
			}
		}

		if (objectIds.length === 0)
			return null;
		return { objectIds, data };
	};

	/**
	 * Парсеры значений.
	 * @type {Object.<number, (d: Buffer, devType?: string) => Object>}
	 */
	static #objectParsers = {
		0x0003: (d) => ({ motion: d[0], motion_timer: d[0] }),
		0x0006: (d) => {
			if (d.length !== 5)
				return {};
			const keyId = d.readUInt32LE(0);
			const match = d[4];
			return {
				fingerprint: match === 0 ? 1 : 0,
				key_id: keyId === 0 ? 'admin' : (keyId === 0xFFFFFFFF ? 'unknown' : keyId),
				result: match === 0 ? 'match' : 'failed'
			};
		},
		0x0007: (d) => ({ door: d[0] === 0 || d[0] === 2 || d[0] === 4 ? 1 : 0, door_action_id: d[0] }),
		0x0008: (d) => ({ armed_away: d[0] ^ 1 }),
		0x0010: (d) => ({ toothbrush: d[0] === 0 ? 1 : 0, counter: d.length > 1 ? d[1] : undefined }),
		0x000A: (d) => d.length === 2 ? ({ temperature: d.readInt16LE(0) / 100 }) : {},
		0x000B: (d) => ({ lock_event: d[0], key_id: d.readUInt32LE(1) }),
		0x000F: (d) => {
			if (d.length !== 3)
				return {};
			const val = d.readUInt32LE(0) & 0xFFFFFF;
			return { motion: 1, illuminance: val, light: val >= 100 ? 1 : 0 };
		},
		0x1001: (d) => d.length === 3 ? { button_type: d[0], value: d[1], press_type: d[2] } : {},
		0x1004: (d) => ({ temperature: d.readInt16LE(0) / 10 }),
		0x1005: (d) => ({ switch: d[0], temperature: d[1] }),
		0x1006: (d) => ({ humidity: d.readUInt16LE(0) / 10 }),
		0x1007: (d) => {
			const illum = d.readUIntLE(0, 3);
			return { illuminance: illum, light: illum === 100 ? 1 : 0 };
		},
		0x1008: (d) => ({ moisture: d[0] }),
		0x1009: (d) => ({ conductivity: d.readUInt16LE(0) }),
		0x1010: (d) => ({ formaldehyde: d.readUInt16LE(0) / 100 }),
		0x1012: (d) => ({ switch: d[0] }),
		0x1013: (d) => ({ consumable: d[0] }),
		0x1014: (d) => ({ moisture: d[0] }),
		0x1015: (d) => ({ smoke: d[0] }),
		0x1017: (d) => ({ motion: d.readUInt32LE(0) === 0 ? 1 : 0, no_motion_time: d.readUInt32LE(0) }),
		0x1018: (d) => ({ light: d[0] }),
		0x1019: (d) => ({ opening: d[0] === 0 ? 1 : 0, status: d[0] }),
		0x101B: (d) => ({ motion: d.readUInt32LE(0) === 0 ? 1 : 0 }),
		0x100A: (d) => ({ battery: d[0], voltage: 2.2 + (3.1 - 2.2) * (d[0] / 100) }),
		0x100D: (d) => ({ temperature: d.readInt16LE(0) / 10, humidity: d.readUInt16LE(2) / 10 }),
		0x100E: (d) => ({ lock: (d[0] & 0x01) ^ 1 }),
		0x2000: (d) => {
			if (d.length !== 5)
				return {};
			const t1 = d.readInt16LE(0);
			const t2 = d.readInt16LE(2);
			const body = (3.71934 * Math.pow(10, -11) * Math.exp(0.69314 * t1 / 100) - (1.02801 * Math.pow(10, -8) * Math.exp(0.53871 * t2 / 100)) + 36.413);
			return { temperature: body, battery: d[4] };
		},
		0x3003: (d) => ({ toothbrush: d[0] === 0 ? 1 : 0 }),
		0x4801: (d) => ({ temperature: d.readFloatLE(0) }),
		0x4802: (d) => ({ humidity: d[0] }),
		0x4803: (d) => ({ battery: d[0] }),
		0x4804: (d) => ({ opening: d[0] === 1 ? 1 : 0 }),
		0x4805: (d) => ({ illuminance: d.readFloatLE(0) }),
		0x4806: (d) => ({ moisture: d[0] }),
		0x4808: (d) => ({ humidity: d.readFloatLE(0) }),
		0x4810: (d) => ({ sleeping: d[0] }),
		0x4811: (d) => ({ snoring: d[0] }),
		0x4818: (d) => ({ motion: d.readUInt16LE(0) === 0 ? 1 : 0 }),
		0x483C: (d) => ({ pressure_state: d[0] }),
		0x483D: (d) => ({ pressure_duration: d.readUInt32LE(0) }),
		0x484E: (d) => ({ motion: d[0] === 1 ? 1 : 0 }),
		0x4A01: (d) => ({ low_battery: d[0] }),
		0x4A08: (d) => ({ motion: 1, illuminance: d.readFloatLE(0) }),
		0x4A0C: () => ({ button: 'single', switch: 'toggle' }),
		0x4A0D: () => ({ button: 'double', switch: 'toggle' }),
		0x4A0E: () => ({ button: 'long', switch: 'toggle' }),
		0x4A0F: () => ({ opening: 1, status: 'forced' }),
		0x4A12: (d) => ({ opening: d[0] === 1 ? 1 : 0 }),
		0x4A13: () => ({ button: 'toggle' }),
		0x4A1A: () => ({ opening: 1, status: 'not_closed' }),
		0x4A1C: (d) => ({ reset: d[0] }),
		0x4C01: (d) => ({ temperature: d.readFloatLE(0) }),
		0x4C02: (d) => ({ humidity: d[0] }),
		0x4C03: (d) => ({ battery: d[0] }),
		0x4C08: (d) => ({ humidity: d.readFloatLE(0) }),
		0x4C14: (d) => ({ mode: d[0] }),
		0x4E01: (d) => ({ low_battery: d[0] }),
		0x4E0C: (d) => ({ click: d[0] }),
		0x4E16: (d) => ({ bed_occupancy: d[0] === 1 ? 1 : 0 }),
		0x5003: (d) => ({ battery: d[0] }),
		0x5403: (d) => ({ battery: d[0] }),
		0x5601: (d) => ({ low_battery: d[0] }),
		0x5A16: (d) => ({ bed_occupancy: d[0] === 1 ? 1 : 0 }),
		0x6E16: (d) => {
			const data = d.readUInt32LE(1);
			const mass = data & 0x7FF;
			const impedance = data >> 18;
			return { weight: mass / 10, impedance: impedance / 10 };
		}
	};
};
