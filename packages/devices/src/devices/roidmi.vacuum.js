import Device from 'xmihome/device.js';
import zlib from 'zlib';
/** @import { Property, Action } from 'xmihome/device.js' */

/**
 * Класс для управления пылесосом ROIDMI EVE.
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
	 * Возможные значения свойства `status` (статус работы).
	 * @type {object}
	 */
	static STATUS = {
		1: 'Dormant',
		2: 'Idle',
		3: 'Paused',
		4: 'Sweeping',
		5: 'Go Charging',
		6: 'Charging',
		7: 'Error',
		8: 'Remote Control',
		9: 'Full Charge',
		10: 'Shutdown',
		11: 'Find Charger Paused'
	};

	/**
	 * Возможные значения свойства `fault` (коды ошибок).
	 * @type {object}
	 */
	static FAULT = {
		0: 'No Faults',
		1: 'Low Battery, returning to charger',
		2: 'Low Battery and Powering Off',
		3: 'Wheel trapped',
		4: 'Collision sensor error',
		5: 'Device tilted',
		6: 'Lidar blocked',
		7: 'Front collision sensor dirty',
		8: 'Side wall sensor dirty',
		9: 'Main brush trapped',
		10: 'Side brush trapped',
		11: 'Fan speed error',
		12: 'Lidar cover trapped',
		13: 'Dustbin full, please clean',
		14: 'Dustbin removed',
		15: 'Dustbin full (while removed)',
		16: 'Device trapped',
		17: 'Device lifted, place on ground to start',
		18: 'Water tank removed',
		19: 'Insufficient water',
		20: 'Designated area unreachable',
		21: 'Cannot start from forbidden zone',
		22: 'Cliff sensor detected, move away to start',
		23: 'Water pump current error',
		24: 'Failed to return to charger',
		25: 'Low power clean, water pump open circuit'
	};

	/**
	 * Возможные значения свойства `mode` (мощность всасывания).
	 * @type {string[]}
	 */
	static MODE = ['Off', 'Silent', 'Basic', 'Strong', 'Full Speed'];

	/**
	 * Возможные значения свойства `sweep_type` (тип уборки).
	 * @type {string[]}
	 */
	static SWEEP_TYPE = ['Sweep', 'Mop', 'Mop and Sweep'];

	/**
	 * Возможные значения свойства `charging_status`.
	 * @type {object}
	 */
	static CHARGING_STATUS = {
		1: 'Charging',
		2: 'Not charging',
		3: 'Not chargeable'
	};

	/**
	 * Возможные значения свойства `water_level` (уровень подачи воды).
	 * @type {string[]}
	 */
	static WATER_LEVEL = ['Off', 'Low', 'Medium', 'High', 'Maximum'];

	/**
	 * @type {({
	 *   status: Property,
	 *   fault: Property,
	 *   mode: Property,
	 *   sweep_type: Property,
	 *   battery_level: Property,
	 *   charging_status: Property,
	 *   water_level: Property
	 * }) & { [x: string]: Property }}
	 * @property {Property} status - Статус работы.
	 * @property {Property} fault - Код ошибки устройства.
	 * @property {Property} mode - Уровень мощности всасывания.
	 * @property {Property} sweep_type - Тип уборки
	 * @property {Property} battery_level - Уровень заряда батареи в процентах.
	 * @property {Property} charging_status - Статус процесса зарядки.
	 * @property {Property} water_level - Уровень подачи воды.
	 */
	properties = {
		'status': { siid: 2, piid: 1, format: 'uint8', access: ['read', 'notify'] },
		'fault': { siid: 2, piid: 2, format: 'uint8', access: ['read', 'notify'] },
		'mode': { siid: 2, piid: 4, format: 'uint8', access: ['read', 'write', 'notify'] },
		'sweep_type': { siid: 2, piid: 8, format: 'uint8', access: ['read', 'notify'] },
		'battery_level': { siid: 3, piid: 1, format: 'uint8', access: ['read', 'notify'] },
		'charging_status': { siid: 3, piid: 2, format: 'uint8', access: ['read', 'notify'] },
		'water_level': { siid: 8, piid: 11, format: 'uint8', access: ['read', 'write', 'notify'] }
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
		'start_sweep': { siid: 2, aiid: 1 },
		'stop_sweep': { siid: 2, aiid: 2 },
		'start_charge': { siid: 3, aiid: 1 },
		'start_room_sweep': { siid: 14, aiid: 1 }
	};

	/**
	 * @type {Buffer|null} Кэш бинарных данных пикселей карты.
	 */
	#pixelData = null;

	/**
	 * @type {object|null} Кэш метаданных карты.
	 */
	#metaData = null;

	/**
	 * @type {number} Временная метка сохранения кэша в миллисекундах.
	 */
	#cacheTimestamp = 0;

	/**
	 * Получает временную подписанную ссылку для скачивания файла, связанного с устройством.
	 * @param {string} obj_name Имя объекта/файла в облачном хранилище.
	 * @returns {Promise<string>} URL для скачивания файла.
	 */
	async #getFileUrl(obj_name) {
		this.client.log('debug', `Requesting file URL for object: ${obj_name}`);
		const response = await this.client.miot.request('/v2/home/get_interim_file_url', {
			obj_name,
			did: this.config.id
		});
		if ((response.code !== 0) || !response.result?.url)
			throw new Error(`Failed to get file URL: ${response.message || 'Unknown error'}`);
		this.client.log('info', `Successfully got file URL for: ${obj_name}`);
		return response.result.url;
	};

	/**
	 * Загружает и парсит файл карты. Использует и проверяет кэш на основе временной метки.
	 * @returns {Promise<{pixelData: Buffer, metaData: object}>}
	 */
	async #loadMapData() {
		if (this.#pixelData && this.#metaData) {
			if ((Date.now() - this.#cacheTimestamp) < 15_000)
				return {
					pixelData: this.#pixelData,
					metaData: this.#metaData
				};
		}
		if (this.connectionType !== 'cloud')
			throw new Error('Getting file URLs is only supported for cloud connections.');
		if (!this.client.miot.credentials.serviceToken)
			await this.client.miot.login();

		this.client.log('info', 'Requesting map data file (obj_name ending in /0)...');
		const url = await this.#getFileUrl(`${this.client.miot.credentials.userId}/${this.config.id}/0`);
		const response = await fetch(url);
		if (!response.ok)
			throw new Error(`Failed to download map file: ${response.statusText}`);

		const buffer = await response.arrayBuffer();
		this.client.log('info', `Map data downloaded successfully (${buffer.byteLength} bytes).`);

		const decompressed = zlib.gunzipSync(Buffer.from(buffer));
		this.client.log('debug', `Map buffer decompressed. Total size: ${decompressed.length} bytes.`);

		const firstBrace = decompressed.indexOf('{');
		const lastBrace = decompressed.lastIndexOf('}');
		if ((firstBrace === -1) || (lastBrace === -1) || (lastBrace < firstBrace))
			throw new Error('Could not find a valid JSON object within the decompressed map data.');
		const jsonString = decompressed.toString('utf8', firstBrace, lastBrace + 1);
		this.#metaData = JSON.parse(jsonString);

		const expectedPixelDataSize = this.#metaData.width * this.#metaData.height;
		const preJsonBlock = decompressed.subarray(0, firstBrace);
		const headerSize = preJsonBlock.length - expectedPixelDataSize;
		this.client.log('debug', `Autodetected map header size: ${headerSize} bytes.`);
		if (headerSize < 0)
			throw new Error("Mismatch in map data size. Decompressed data is smaller than expected.");
		this.#pixelData = preJsonBlock.subarray(headerSize);

		this.#cacheTimestamp = Date.now();
		return {
			pixelData: this.#pixelData,
			metaData: this.#metaData
		};
	};

	/**
	 * Преобразует мировые координаты (в мм) в пиксельные координаты SVG.
	 * @param {number} worldX_mm - Координата X в мм.
	 * @param {number} worldY_mm - Координата Y в мм.
	 * @param {object} metaData - Метаданные карты.
	 * @returns {{x: number, y: number}} - Пиксельные координаты.
	 */
	#transformToPixels(worldX_mm, worldY_mm, metaData) {
		const { x_min, y_min, resolution, height } = metaData;
		return {
			x: ((worldX_mm / 1_000) - x_min) / resolution,
			y: height - (((worldY_mm / 1_000) - y_min) / resolution)
		};
	};

	/**
	 * Получает список комнат из метаданных карты.
	 * @returns {Promise<{mapId: number, segments: {id: number, name: string}[]}>}
	 */
	async getRooms() {
		const segments = [];
		this.client.log('info', 'Getting rooms from parsed map file...');
		const { metaData } = await this.#loadMapData();
		this.client.log('debug', 'Parsed map metadata:', metaData);
		const mapId = metaData.mapId;
		const roomList = metaData.autoAreaValue;
		if (Array.isArray(roomList)) {
			roomList.forEach(room => segments.push({
				id: parseInt(room.id, 10),
				name: room.name
			}));
			this.client.log('info', `Successfully parsed ${segments.length} rooms.`);
		} else
			this.client.log('warn', 'Found JSON, but "autoAreaValue" is not a valid array.');
		return { mapId, segments };
	};

	/**
	 * Генерирует SVG-изображение карты.
	 * @returns {Promise<string>} Строка, содержащая SVG-разметку.
	 */
	async getMapImage() {
		const { pixelData, metaData } = await this.#loadMapData();
		const { width, height } = metaData;
		const assignedRoomColors = {};
		let nextColorIndex = 0;

		const PALETTE = ['#00BCD4', '#4CAF50', '#FFC107', '#9575CD', '#42A5F5', '#FF7043', '#EC407A', '#26A69A'];
		const COLORS = {
			WALL: '#424242',
			SEEN_AREA: '#DCDCDC',
			UNKNOWN: '#EEEEEE',
			PATH: 'rgba(255, 255, 255, 0.8)',
			NO_GO_ZONE_FILL: 'rgba(239, 83, 80, 0.7)',
			CHARGER: '#616161',
			ROBOT: '#616161',
			TEXT: '#000000'
		};

		const svgParts = [];
		svgParts.push(`<svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background-color: ${COLORS.UNKNOWN};">`);

		const mapLayer = [];
		const roomCenters = {};
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const svgY = height - 1 - y;
				const byteIndex = y * width + x;
				if (byteIndex >= pixelData.length)
					continue;

				const pixelType = pixelData[byteIndex];
				let color;
				if (pixelType === 0xff)
					color = COLORS.SEEN_AREA;
				else if (pixelType === 0x00)
					color = COLORS.WALL;
				else if (pixelType > 0 && pixelType < 0x7f) {
					if (!assignedRoomColors[pixelType]) {
						assignedRoomColors[pixelType] = PALETTE[nextColorIndex % PALETTE.length];
						nextColorIndex++;
					}
					color = assignedRoomColors[pixelType];
					if (!roomCenters[pixelType])
						roomCenters[pixelType] = {
							x_sum: 0,
							y_sum: 0,
							count: 0
						};
					roomCenters[pixelType].x_sum += x;
					roomCenters[pixelType].y_sum += svgY;
					roomCenters[pixelType].count++;
				}
				if (color)
					mapLayer.push(`<rect x="${x}" y="${svgY}" width="1" height="1" fill="${color}" />`);
			}
		}
		svgParts.push(`<g id="map-layer">${mapLayer.join('')}</g>`);

		if (metaData.posArray) {
			const pathPoints = JSON.parse(metaData.posArray);
			if (pathPoints && (pathPoints.length > 0)) {
				const pixelPathParts = [];
				for (const point of pathPoints) {
					const { x, y } = this.#transformToPixels(point[0], point[1], metaData);
					pixelPathParts.push(`${x},${y}`);
				}
				svgParts.push(`<polyline points="${pixelPathParts.join(' ')}" fill="none" stroke="${COLORS.PATH}" stroke-width="0.8" stroke-opacity="0.8" />`);
			}
		}

		if (metaData.area && (metaData.area.length > 0)) {
			const forbiddenLayer = [];
			for (const area of metaData.area) {
				const points = [];
				for (const vertex of area.vertexs) {
					const { x, y } = this.#transformToPixels(vertex[0], vertex[1], metaData);
					points.push(`${x},${y}`);
				}
				forbiddenLayer.push(`<polygon points="${points.join(' ')}" fill="${COLORS.NO_GO_ZONE_FILL}" />`);
			}
			svgParts.push(`<g id="forbidden-layer">${forbiddenLayer.join('')}</g>`);
		}

		const iconsLayer = [];
		if (metaData.chargeHandlePos) {
			const { x, y } = this.#transformToPixels(metaData.chargeHandlePos[0], metaData.chargeHandlePos[1], metaData);
			iconsLayer.push(`<g id="charger">
				<circle cx="${x}" cy="${y}" r="3" fill="${COLORS.CHARGER}" stroke="${COLORS.WALL}" stroke-width="0.8"/>
			</g>`);
		}

		if ((metaData.posX !== undefined) && (metaData.posY !== undefined)) {
			const { x, y } = this.#transformToPixels(metaData.posX, metaData.posY, metaData);
			const angle = (metaData.posPhi / 10) + 90;
			iconsLayer.push(`<g id="robot" transform="translate(${x}, ${y}) rotate(${angle})">
				<circle cx="0" cy="0" r="2.5" fill="${COLORS.ROBOT}" opacity="0.8"/>
				<path d="M 0 -2 L 1.5 1 L -1.5 1 Z" fill="${COLORS.WALL}"/>
			</g>`);
		}
		svgParts.push(`<g id="icons-layer">${iconsLayer.join('')}</g>`);

		if (metaData.autoAreaValue) {
			const textLayer = [];
			for (const room of metaData.autoAreaValue) {
				const centerInfo = roomCenters[room.id];
				if (centerInfo) {
					const centerX = centerInfo.x_sum / centerInfo.count;
					const centerY = centerInfo.y_sum / centerInfo.count;
					textLayer.push(`<text x="${centerX}" y="${centerY}" fill="${COLORS.TEXT}" font-size="5" text-anchor="middle" dominant-baseline="middle" style="paint-order: stroke; fill: ${COLORS.TEXT}; stroke: #FFF; stroke-width: 0.5px; stroke-linejoin: round;">${room.name}</text>`);
				}
			}
			svgParts.push(`<g id="text-layer">${textLayer.join('')}</g>`);
		}

		svgParts.push('</svg>');
		return svgParts.join('');
	};
};
