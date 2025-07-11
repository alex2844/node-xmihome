import Device from 'xmihome/device.js';
/** @import { XiaomiMiHome } from 'xmihome' */
/** @import { Config as DeviceConfig, Property, UuidMapping, Schema } from 'xmihome/device.js' */

/**
 * @typedef {DeviceConfig & {
 *   user?: {
 *     height: number,
 *     birthday: string,
 *     gender: 'male'|'female'
 *   }
 * }} Config
 */

/**
 * Класс для управления умными весами Xiaomi Body Composition Scale.
 * @extends Device
 */
export default class XiaomiScales extends Device {
	/** @type {string} */
	static name = 'Xiaomi Body Composition Scale';

	/** @type {string[]} */
	static models = [
		'xiaomi.scales.ms115'
	];

	/** @type {UuidMapping} */
	static uuidMap = {
		services: {
			'0000181b-0000-1000-8000-00805f9b34fb': '0017'
		},
		characteristics: {
			'00002a9c-0000-1000-8000-00805f9b34fb': '001c'
		}
	};

	/** @type {Schema} */
	static schema = {
		key: 'user',
		fields: [
			{ key: 'height', type: 'number' },
			{ key: 'birthday', type: 'date' },
			{ key: 'gender', type: 'select', options: ['male', 'female'] }
		]
	};

	/**
	 * Типы телосложения.
	 * @type {string[]}
	 */
	static BODY_TYPES = ['obese', 'overweight', 'thick-set', 'lack-exerscise', 'balanced', 'balanced-muscular', 'skinny', 'balanced-skinny', 'skinny-muscular'];

	/**
	 * Статусы для индекса массы тела (ИМТ).
	 * @type {string[]}
	 */
	static BMI_STATUSES = ['Underweight', 'Normal', 'Overweight', 'Obese', 'Morbidly Obese'];

	/**
	 * Статусы для процента жира в организме.
	 * @type {string[]}
	 */
	static BODY_FAT_STATUSES = ['Very Low', 'Low', 'Normal', 'High', 'Very High'];

	/**
	 * Статусы для мышечной массы.
	 * @type {string[]}
	 */
	static MUSCLE_MASS_STATUSES = ['Insufficient', 'Normal', 'Good'];

	/**
	 * Статусы для процента воды в организме.
	 * @type {string[]}
	 */
	static WATER_STATUSES = ['Insufficient', 'Normal', 'Good'];

	/**
	 * Статусы для костной массы.
	 * @type {string[]}
	 */
	static BONE_MASS_STATUSES = ['Insufficient', 'Normal', 'Good'];

	/**
	 * Статусы для процента белка.
	 * @type {string[]}
	 */
	static PROTEIN_STATUSES = ['Insufficient', 'Normal', 'Good'];

	/**
	 * Статусы для висцерального жира.
	 * @type {string[]}
	 */
	static VISCERAL_FAT_STATUSES = ['Normal', 'High', 'Very High'];

	/**
	 * Статусы для базального метаболизма (BMR).
	 * @type {string[]}
	 */
	static BASAL_METABOLISM_STATUSES = ['Insufficient', 'Normal'];

	/**
	 * Шкалы для оценки мышечной массы в зависимости от роста и пола.
	 * @type {Array<{min: number, F: number[], M: number[]}>}
	 */
	static MUSCLE_MASS_SCALES = [
		{ min: 170, F: [36.5, 42.5], M: [49.5, 59.4] },
		{ min: 160, F: [32.9, 37.5], M: [44.0, 52.4] },
		{ min: 0, F: [29.1, 34.7], M: [38.5, 46.5] }
	];

	/**
	 * Шкалы для оценки костной массы в зависимости от веса и пола.
	 * @type {Array<{F: {min: number, optimal: number}, M: {min: number, optimal: number}}>}
	 */
	static BONE_MASS_SCALES = [
		{ F: { min: 60, optimal: 2.5 }, M: { min: 75, optimal: 3.2 } },
		{ F: { min: 45, optimal: 2.2 }, M: { min: 69, optimal: 2.9 } },
		{ F: { min: 0, optimal: 1.8 }, M: { min: 0, optimal: 2.5 } }
	];

	/**
	 * Шкалы для оценки процента жира в зависимости от возраста и пола.
	 * @type {Array<{min: number, max: number, F: number[], M: number[]}>}
	 */
	static FAT_PERCENTAGE_SCALES = [
		{ min: 0, max: 20, F: [18, 23, 30, 35], M: [8, 14, 21, 25] },
		{ min: 21, max: 25, F: [19, 24, 30, 35], M: [10, 15, 22, 26] },
		{ min: 26, max: 30, F: [20, 25, 31, 36], M: [11, 16, 21, 27] },
		{ min: 31, max: 35, F: [21, 26, 33, 36], M: [13, 17, 25, 28] },
		{ min: 46, max: 40, F: [22, 27, 34, 37], M: [15, 20, 26, 29] },
		{ min: 41, max: 45, F: [23, 28, 35, 38], M: [16, 22, 27, 30] },
		{ min: 46, max: 50, F: [24, 30, 36, 38], M: [17, 23, 29, 31] },
		{ min: 51, max: 55, F: [26, 31, 36, 39], M: [19, 25, 30, 33] },
		{ min: 56, max: 100, F: [27, 32, 37, 40], M: [21, 26, 31, 34] },
	];

	/**
	 * Получает текстовое описание для значения на основе шкалы.
	 * @param {number} val - Значение.
	 * @param {number[]} scale - Массив пороговых значений шкалы.
	 * @param {string[]} descriptions - Массив текстовых описаний.
	 * @returns {string} Текстовое описание.
	 */
	static GET_SCALE_VALUE_DESCRIPTION(val, scale, descriptions) {
		let desc;
		scale.some((s, i) => {
			if (val <= s) {
				desc = descriptions[i];
				return true;
			}
		});
		return desc || descriptions[descriptions.length - 1];
	};

	/**
	 * Ограничивает значение заданным диапазоном.
	 * @param {number} val - Значение.
	 * @param {number} min - Минимальный порог.
	 * @param {number} max - Максимальный порог.
	 * @returns {number} Ограниченное значение.
	 */
	static CHECK_OVERFLOW(val, min, max) {
		if (val < min)
			return min;
		if (val > max)
			return max;
		return val;
	};

	/**
	 * @typedef {Omit<Property, 'read'> & {
	 *   read: (buf: Buffer) => ({
	 *     isStabilized: false,
	 *     weight: number,
	 *     unit: string
	 *   } | {
	 *     isStabilized: true,
	 *     timestamp: string,
	 *     weight: number,
	 *     unit: string,
	 *     impedance: number,
	 *     bmi?: { value: number, status: string },
	 *     bodyScore?: { value: number },
	 *     bodyFat?: { value: number, status: string },
	 *     muscleMass?: { value: number, status: string },
	 *     water?: { value: number, status: string },
	 *     boneMass?: { value: number, status: string },
	 *     protein?: { value: number, status: string },
	 *     visceralFat?: { value: number, status: string },
	 *     basalMetabolism?: { value: number },
	 *     bodyAge?: { value: number },
	 *     idealWeight?: { value: number },
	 *     bodyType?: { value: string },
	 *   } | null)
	 * }} MeasurementProperty
	 */
	/**
	 * @type {({
	 *   measurement: MeasurementProperty
	 * }) & { [x: string]: Property }}
	 * @property {MeasurementProperty} measurement Характеристика для получения данных измерений. Возвращает промежуточные (только вес) и финальные (полный отчет) данные.
	 */
	properties = {
		'measurement': {
			service: '0000181b-0000-1000-8000-00805f9b34fb',
			characteristic: '00002a9c-0000-1000-8000-00805f9b34fb',
			access: ['read', 'notify'],
			read: buf => {
				if (buf.length < 2)
					return null;
				const isImperial = (buf.readUInt8(0) & 0x01) !== 0;
				const unit = isImperial ? 'lbs' : 'kg';
				const divisor = isImperial ? 100 : 200;
				const isStabilized = (buf.readUInt8(1) & 0x20) !== 0;
				const hasImpedance = (buf.readUInt8(1) & 0x02) !== 0;
				if (buf.length >= 13 && isStabilized && hasImpedance) {
					const result = {
						isStabilized: true,
						timestamp: new Date(buf.readUInt16LE(2), buf.readUInt8(4) - 1, buf.readUInt8(5), buf.readUInt8(6), buf.readUInt8(7), buf.readUInt8(8)).toISOString(),
						impedance: buf.readUInt16LE(9),
						weight: parseFloat((buf.readUInt16LE(11) / divisor).toFixed(2)),
						unit
					};
					if (this.config?.user) {
						const metrics = this.calculateBodyMetrics(result.weight, result.impedance);
						return { ...result, ...metrics };
					}
					return result;
				}
				if (buf.length > 0)
					return {
						isStabilized: false,
						weight: parseFloat((buf.readUInt16LE(buf.length - 2) / divisor).toFixed(2)),
						unit
					};
				return null;
			}
		}
	};

	/** @param {Config} config @param {XiaomiMiHome} client */
	constructor(config, client) {
		super(config, client);
		this.config = config;
	};

	/**
	 * Рассчитывает все метрики тела на основе веса и импеданса.
	 * @param {number} weight - Вес в кг.
	 * @param {number} impedance - Электрический импеданс.
	 * @returns {object} Объект со всеми рассчитанными метриками.
	 */
	calculateBodyMetrics(weight, impedance) {
		const { height, birthday, gender } = this.config.user;
		if (!height || !birthday || !gender)
			return null;
		const age = (new Date().getTime() - new Date(birthday).getTime()) / 31_556_926_000;
		if (isNaN(age)) {
			this.client?.log('error', 'Invalid birthdate, cannot calculate age.');
			return null;
		}
		const sex = gender === 'male' ? 'M' : 'F';
		const lbm = this.getLBMCoefficient(weight, impedance, height, age);
		const bodyFat = this.getFatPercentage(lbm, weight, age, sex, height);
		const boneMass = this.getBoneMass(lbm, sex);
		const muscleMass = this.getMuscleMass(weight, bodyFat, boneMass);
		const water = this.getWaterPercentage(bodyFat);
		const protein = this.getProteinPercentage(weight, bodyFat, water, boneMass);

		const bmi = this.getBMI(weight, height);
		const bmr = this.getBMR(weight, height, age, sex);
		const visceralFat = this.getVisceralFat(weight, age, height, sex);

		const bodyFatScale = this.getFatPercentageScale(age, sex);
		const muscleMassScale = this.getMuscleMassScale(height, sex);

		return {
			bmi: {
				value: parseFloat(bmi.toFixed(2)),
				status: XiaomiScales.GET_SCALE_VALUE_DESCRIPTION(bmi, this.getBMIScale(), XiaomiScales.BMI_STATUSES)
			},
			bodyFat: {
				value: parseFloat(bodyFat.toFixed(2)),
				status: XiaomiScales.GET_SCALE_VALUE_DESCRIPTION(bodyFat, bodyFatScale, XiaomiScales.BODY_FAT_STATUSES)
			},
			muscleMass: {
				value: parseFloat(muscleMass.toFixed(2)),
				status: XiaomiScales.GET_SCALE_VALUE_DESCRIPTION(muscleMass, muscleMassScale, XiaomiScales.MUSCLE_MASS_STATUSES)
			},
			water: {
				value: parseFloat(water.toFixed(2)),
				status: XiaomiScales.GET_SCALE_VALUE_DESCRIPTION(water, this.getWaterPercentageScale(), XiaomiScales.WATER_STATUSES)
			},
			boneMass: {
				value: parseFloat(boneMass.toFixed(2)),
				status: XiaomiScales.GET_SCALE_VALUE_DESCRIPTION(boneMass, this.getBoneMassScale(weight, sex), XiaomiScales.BONE_MASS_STATUSES)
			},
			protein: {
				value: parseFloat(protein.toFixed(2)),
				status: XiaomiScales.GET_SCALE_VALUE_DESCRIPTION(protein, this.getProteinPercentageScale(), XiaomiScales.PROTEIN_STATUSES)
			},
			visceralFat: {
				value: parseFloat(visceralFat.toFixed(2)),
				status: XiaomiScales.GET_SCALE_VALUE_DESCRIPTION(visceralFat, this.getVisceralFatScale(), XiaomiScales.VISCERAL_FAT_STATUSES)
			},
			basalMetabolism: {
				value: parseFloat(bmr.toFixed(2))
			},
			bodyAge: {
				value: Math.round(this.getBodyAge(bodyFat, age, sex))
			},
			idealWeight: {
				value: parseFloat(this.getIdealWeight(height).toFixed(2))
			},
			bodyType: {
				value: this.getBodyType(bodyFat, muscleMass, bodyFatScale, muscleMassScale)
			},
			bodyScore: {
				value: parseFloat(this.getBodyScore(weight, bodyFat, muscleMass, water, bmr).toFixed(2))
			}
		};
	};

	/**
	 * Рассчитывает коэффициент безжировой массы тела (LBM).
	 * @param {number} weight Вес (кг).
	 * @param {number} impedance Импеданс.
	 * @param {number} height Рост (см).
	 * @param {number} age Возраст (лет).
	 * @returns {number} Коэффициент LBM.
	 */
	getLBMCoefficient(weight, impedance, height, age) {
		let lbm = (height * 9.058 / 100) * (height / 100);
		lbm += weight * 0.32 + 12.226;
		lbm -= impedance * 0.0068;
		lbm -= age * 0.0542;
		return lbm;
	};

	/**
	 * Рассчитывает базальный метаболизм (BMR).
	 * @param {number} weight Вес (кг).
	 * @param {number} height Рост (см).
	 * @param {number} age Возраст (лет).
	 * @param {'M'|'F'} sex Пол.
	 * @returns {number} Количество калорий BMR.
	 */
	getBMR(weight, height, age, sex) {
		let bmr;
		if (sex === 'M') {
			bmr = 877.8 + weight * 14.916 - height * 0.726 - age * 8.976;
			if (bmr > 2322)
				bmr = 5000;
		} else {
			bmr = 864.6 + weight * 10.2036 - height * 0.39336 - age * 6.204;
			if (bmr > 2996)
				bmr = 5000;
		}
		return XiaomiScales.CHECK_OVERFLOW(bmr, 500, 10000);
	};

	/**
	 * Рассчитывает процент жира в организме.
	 * @param {number} lbm Коэффициент безжировой массы тела.
	 * @param {number} weight Вес (кг).
	 * @param {number} age Возраст (лет).
	 * @param {'M'|'F'} sex Пол.
	 * @param {number} height Рост (см).
	 * @returns {number} Процент жира.
	 */
	getFatPercentage(lbm, weight, age, sex, height) {
		let fatPercentage;
		let coefficient = 1.0;
		let negativeConstant;
		if (sex === 'F') {
			negativeConstant = (age <= 49) ? 9.25 : 7.25;
			if (weight > 60) {
				coefficient = 0.96;
				if (height > 160)
					coefficient *= 1.03;
			} else if (weight < 50) {
				coefficient = 1.02;
				if (height > 160)
					coefficient *= 1.03;
			}
		} else {
			negativeConstant = 0.8;
			if (weight < 61)
				coefficient = 0.98;
		}
		fatPercentage = (1.0 - (((lbm - negativeConstant) * coefficient) / weight)) * 100;
		if (fatPercentage > 63)
			fatPercentage = 75;
		return XiaomiScales.CHECK_OVERFLOW(fatPercentage, 5, 75);
	};

	/**
	 * Возвращает шкалу для оценки процента жира.
	 * @param {number} age Возраст (лет).
	 * @param {'M'|'F'} sex Пол.
	 * @returns {number[]} Массив пороговых значений.
	 */
	getFatPercentageScale(age, sex) {
		const scale = XiaomiScales.FAT_PERCENTAGE_SCALES.find(s => age >= s.min && age <= s.max);
		return scale ? scale[sex] : [];
	};

	/**
	 * Рассчитывает процент воды в организме.
	 * @param {number} fatPercentage Процент жира.
	 * @returns {number} Процент воды.
	 */
	getWaterPercentage(fatPercentage) {
		let waterPercentage = (100 - fatPercentage) * 0.7;
		let coefficient = (waterPercentage <= 50) ? 1.02 : 0.98;
		if (waterPercentage * coefficient >= 65)
			waterPercentage = 75;
		return XiaomiScales.CHECK_OVERFLOW(waterPercentage * coefficient, 35, 75);
	};

	/**
	 * Возвращает шкалу для оценки процента воды.
	 * @returns {number[]} Массив пороговых значений.
	 */
	getWaterPercentageScale() {
		return [53, 67];
	};

	/**
	 * Рассчитывает массу костей.
	 * @param {number} lbm Коэффициент безжировой массы тела.
	 * @param {'M'|'F'} sex Пол.
	 * @returns {number} Масса костей (кг).
	 */
	getBoneMass(lbm, sex) {
		const base = (sex === 'F') ? 0.245691014 : 0.18016894;
		let boneMass = (base - (lbm * 0.05158)) * -1;
		if (boneMass > 2.2)
			boneMass += 0.1;
		else
			boneMass -= 0.1;
		if ((sex === 'F') && (boneMass > 5.1))
			boneMass = 8;
		else if ((sex === 'M') && (boneMass > 5.2))
			boneMass = 8;
		return XiaomiScales.CHECK_OVERFLOW(boneMass, 0.5, 8);
	};

	/**
	 * Возвращает шкалу для оценки костной массы.
	 * @param {number} weight Вес (кг).
	 * @param {'M'|'F'} sex Пол.
	 * @returns {number[]} Массив пороговых значений.
	 */
	getBoneMassScale(weight, sex) {
		const scale = XiaomiScales.BONE_MASS_SCALES.find(s => weight >= s[sex].min);
		return scale ? [scale[sex].optimal - 1, scale[sex].optimal + 1] : [];
	};

	/**
	 * Рассчитывает мышечную массу.
	 * @param {number} weight Вес (кг).
	 * @param {number} fatPercentage Процент жира.
	 * @param {number} boneMass Костная масса (кг).
	 * @returns {number} Мышечная масса (кг).
	 */
	getMuscleMass(weight, fatPercentage, boneMass) {
		let muscleMass = weight - ((fatPercentage * 0.01) * weight) - boneMass;
		return XiaomiScales.CHECK_OVERFLOW(muscleMass, 10, 120);
	};

	/**
	 * Возвращает шкалу для оценки мышечной массы.
	 * @param {number} height Рост (см).
	 * @param {'M'|'F'} sex Пол.
	 * @returns {number[]} Массив пороговых значений.
	 */
	getMuscleMassScale(height, sex) {
		const scale = XiaomiScales.MUSCLE_MASS_SCALES.find(s => height >= s.min);
		return scale ? scale[sex] : [];
	};

	/**
	 * Рассчитывает уровень висцерального жира.
	 * @param {number} weight Вес (кг).
	 * @param {number} age Возраст (лет).
	 * @param {number} height Рост (см).
	 * @param {'M'|'F'} sex Пол.
	 * @returns {number} Уровень висцерального жира.
	 */
	getVisceralFat(weight, age, height, sex) {
		let vfal;
		if (sex === 'F') {
			const subcalc = 0.691 + (height * -0.0024) + (height * -0.0024);
			vfal = (((height * 0.027) - (subcalc * weight)) * -1) + (age * 0.07) - age;
		} else {
			const subcalc = 0.765 + height * -0.0015;
			vfal = (((height * 0.143) - (weight * subcalc)) * -1) + (age * 0.15) - 5.0;
		}
		return XiaomiScales.CHECK_OVERFLOW(vfal, 1, 50);
	};

	/**
	 * Возвращает шкалу для оценки висцерального жира.
	 * @returns {number[]} Массив пороговых значений.
	 */
	getVisceralFatScale() {
		return [10, 15];
	};

	/**
	 * Рассчитывает индекс массы тела (ИМТ).
	 * @param {number} weight Вес (кг).
	 * @param {number} height Рост (см).
	 * @returns {number} ИМТ.
	 */
	getBMI(weight, height) {
		return XiaomiScales.CHECK_OVERFLOW(weight / ((height / 100) * (height / 100)), 10, 90);
	};

	/**
	 * Возвращает шкалу для оценки ИМТ.
	 * @returns {number[]} Массив пороговых значений.
	 */
	getBMIScale() {
		return [18.5, 25, 28, 32];
	};

	/**
	 * Рассчитывает идеальный вес.
	 * @param {number} height Рост (см).
	 * @returns {number} Идеальный вес (кг).
	 */
	getIdealWeight(height) {
		return XiaomiScales.CHECK_OVERFLOW((22 * height) * height / 10000, 5.5, 198);
	};

	/**
	 * Рассчитывает процент белка в организме.
	 * @param {number} weight Общий вес (кг).
	 * @param {number} fatPercentage Процент жира.
	 * @param {number} waterPercentage Процент воды.
	 * @param {number} boneMass Костная масса (кг).
	 * @returns {number} Процент белка.
	 */
	getProteinPercentage(weight, fatPercentage, waterPercentage, boneMass) {
		const fatMass = weight * (fatPercentage / 100);
		const waterMass = weight * (waterPercentage / 100);
		const proteinMass = weight - fatMass - waterMass - boneMass;
		const proteinPercentage = (proteinMass / weight) * 100;
		return XiaomiScales.CHECK_OVERFLOW(proteinPercentage, 10, 32);
	};

	/**
	 * Возвращает шкалу для оценки процента белка.
	 * @returns {number[]} Массив пороговых значений.
	 */
	getProteinPercentageScale() {
		return [16, 20];
	};

	/**
	 * Определяет тип телосложения.
	 * @param {number} fatPercentage Процент жира.
	 * @param {number} muscleMass Мышечная масса (кг).
	 * @param {number[]} fatScale Шкала оценки жира.
	 * @param {number[]} muscleScale Шкала оценки мышц.
	 * @returns {string} Тип телосложения.
	 */
	getBodyType(fatPercentage, muscleMass, fatScale, muscleScale) {
		let factor;
		if (fatPercentage > fatScale[2])
			factor = 0;
		else if (fatPercentage < fatScale[1])
			factor = 2;
		else
			factor = 1;
		if (muscleMass > muscleScale[1])
			return XiaomiScales.BODY_TYPES[2 + (factor * 3)];
		if (muscleMass < muscleScale[0])
			return XiaomiScales.BODY_TYPES[(factor * 3)];
		return XiaomiScales.BODY_TYPES[1 + (factor * 3)];
	};

	/**
	 * Рассчитывает метаболический возраст.
	 * @param {number} fatPercentage Процент жира.
	 * @param {number} age Возраст (лет).
	 * @param {'M'|'F'} sex Пол.
	 * @returns {number} Метаболический возраст.
	 */
	getBodyAge(fatPercentage, age, sex) {
		let bodyAge;
		if (sex === 'M')
			bodyAge = (fatPercentage * 0.8) + (age * 0.8);
		else
			bodyAge = (fatPercentage * 0.8) + (age * 0.9);
		return XiaomiScales.CHECK_OVERFLOW(bodyAge, 10, 80);
	};

	/**
	 * Рассчитывает общую оценку тела.
	 * @param {number} weight Вес (кг).
	 * @param {number} fatPercentage Процент жира.
	 * @param {number} muscleMass Мышечная масса (кг).
	 * @param {number} waterPercentage Процент воды.
	 * @param {number} bmr Базальный метаболизм.
	 * @returns {number} Оценка тела (от 50 до 100).
	 */
	getBodyScore(weight, fatPercentage, muscleMass, waterPercentage, bmr) {
		let score = 0;
		score += (weight / this.getIdealWeight(this.config.user.height)) * 20;
		score += (100 - fatPercentage) * 0.3;
		score += (muscleMass / (weight * 0.85)) * 30;
		score += (waterPercentage / 65) * 10;
		score += (bmr / 2200) * 10;
		return XiaomiScales.CHECK_OVERFLOW(score, 50, 100);
	};
};
