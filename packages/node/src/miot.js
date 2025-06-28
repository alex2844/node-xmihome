import crypto from 'crypto';
import miio from 'mijia-io';
/** @import { XiaomiMiHome } from './index.js' */

/**
 * Класс для взаимодействия с MiIO и облаком Xiaomi.
 */
export default class Miot {
	/**
	 * Находит спецификацию модели устройства на miot-spec.org.
	 * @param {string} model Модель устройства.
	 * @returns {Promise<object|undefined>} Объект спецификации модели или `undefined`, если модель не найдена.
	 */
	static async findModel(model) {
		const instancesResponse = await fetch('https://miot-spec.org/miot-spec-v2/instances?status=released');
		const /** @type {{ instances: any[] }} */ { instances } = await instancesResponse.json();
		const instance = instances.sort((a, b) => (b.ts - a.ts)).find(instance => instance.model === model);
		if (!instance)
			return;
		const specResponse = await fetch(`https://miot-spec.org/miot-spec-v2/instance?type=${instance.type}`);
		const /** @type {{ type: string, description: string, services: any[] }} */ spec = await specResponse.json();
		const properties = {};
		for (const s of /** @type {{ iid: number, type: string, description: string, properties: any[] }[]} */ (spec.services).slice(1)) {
			const skp = s.type.split(':');
			if (skp[1] === 'miot-spec-v2')
				for (const p of /** @type {{ iid: number, type: string, description: string, format: string, access: any[] }[]} */ (s.properties)) {
					const pkp = p.type.split(':');
					if (p.access.length)
						properties[`${skp[3]}_${pkp[3]}`] = {
							siid: s.iid,
							piid: p.iid,
							format: p.format,
							access: p.access
						};
				}
		}
		return {
			name: spec.description,
			type: spec.type,
			properties
		};
	};

	/**
	 * Локализация для запросов к облаку Xiaomi (по умолчанию 'en').
	 * @type {string}
	 */
	locale = 'en';

	/**
	 * Список поддерживаемых стран для облачных запросов.
	 * @type {string[]}
	 */
	countries = ['sg', 'cn', 'ru', 'us', 'tw', 'de'];

	/**
	 * Экземпляр класса XiaomiMiHome.
	 * @type {XiaomiMiHome}
	 */
	client = null;

	/**
	 * Конструктор класса Miot.
	 * @param {XiaomiMiHome} client Экземпляр класса XiaomiMiHome.
	 */
	constructor(client) {
		this.client = client;
	};

	/**
	 * Возвращает учетные данные для облачного подключения из конфигурации клиента.
	 * @type {object}
	 */
	get credentials() {
		return this.client.config.credentials || {};
	};

	/**
	 * Возвращает модуль miio для прямого взаимодействия с MiIO устройствами.
	 * @type {object}
	 */
	get miio() {
		return miio;
	};

	/**
	 * Разбирает JSON строку, удаляя префикс '&&&START&&&', если он присутствует.
	 * @param {string} str JSON строка.
	 * @returns {object} Разобранный JSON объект.
	 */
	parseJson(str) {
		if (str.indexOf('&&&START&&&') === 0)
			str = str.replace('&&&START&&&', '');
		return JSON.parse(str);
	};

	/**
	 * Возвращает URL API для указанной страны.
	 * @param {string} country Код страны (например, 'ru', 'cn').
	 * @returns {string} URL API.
	 */
	getApiUrl(country) {
		return `https://${country === 'cn' ? '' : `${country}.`}api.io.mi.com/app`;
	};

	/**
	 * Генерирует подпись запроса для облачного API Xiaomi.
	 * @param {string} path Путь API запроса.
	 * @param {string} _signedNonce Signed Nonce.
	 * @param {string} nonce Nonce.
	 * @param {object} params Параметры запроса.
	 * @returns {string} Подпись запроса в base64.
	 */
	generateSignature(path, _signedNonce, nonce, params) {
		const exps = [path, _signedNonce, nonce];
		const paramKeys = Object.keys(params);
		paramKeys.sort();
		for (let i = 0, { length } = paramKeys; i < length; i++) {
			const key = paramKeys[i];
			exps.push(`${key}=${params[key]}`);
		}
		return crypto.createHmac('sha256', Buffer.from(_signedNonce, 'base64')).update(exps.join('&')).digest('base64');
	};

	/**
	 * Генерирует Nonce для запросов к облачному API Xiaomi.
	 * @returns {string} Nonce в base64.
	 */
	generateNonce() {
		const buf = Buffer.allocUnsafe(12);
		buf.write(crypto.randomBytes(8).toString('hex'), 0, 'hex');
		buf.writeInt32BE(Math.floor(Date.now() / 60_000), 8);
		return buf.toString('base64');
	};

	/**
	 * Генерирует Signed Nonce.
	 * @param {string} ssecret Ssecurity.
	 * @param {string} nonce Nonce.
	 * @returns {string} Signed Nonce в base64.
	 */
	signedNonce(ssecret, nonce) {
		const s = Buffer.from(ssecret, 'base64');
		const n = Buffer.from(nonce, 'base64');
		return crypto.createHash('sha256').update(s).update(n).digest('base64');
	};

	/**
	 * Выполняет вход в аккаунт Xiaomi и получает учетные данные (ssecurity, userId, serviceToken).
	 * @throws {Error} Если не удалось выполнить вход на каком-либо из этапов.
	 */
	async login() {
		this.client.log('info', `Attempting login for user: ${this.credentials.username}`);
		if (!this.credentials.username)
			throw new Error('username empty');
		if (!this.credentials.password)
			throw new Error('password empty');

		// --- Шаг 1: Получение _sign ---
		this.client.log('debug', 'Login Step 1: Fetching _sign');
		const step1Response = await fetch('https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true');
		if (!step1Response.ok)
			throw new Error(`Response step 1 error with status ${step1Response.statusText}`);
		const step1Text = await step1Response.text();
		const step1Data = this.parseJson(step1Text);
		if (!step1Data._sign)
			throw new Error('Login step 1 failed: _sign not found');
		const sign = step1Data._sign;
		this.client.log('debug', 'Login Step 1: Got _sign successfully');

		// --- Шаг 2: Отправка учетных данных и получение токенов ---
		this.client.log('debug', 'Login Step 2: Sending credentials');
		const step2Response = await fetch('https://account.xiaomi.com/pass/serviceLoginAuth2', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				user: this.credentials.username,
				hash: crypto.createHash('md5').update(this.credentials.password).digest('hex').toUpperCase(),
				_json: 'true',
				sid: 'xiaomiio',
				callback: 'https://sts.api.io.mi.com/sts',
				qs: '%3Fsid%3Dxiaomiio%26_json%3Dtrue',
				_sign: sign
			})
		});
		if (!step2Response.ok)
			throw new Error(`Response step 2 error with status ${step2Response.statusText}`);
		const step2Text = await step2Response.text();
		const { ssecurity, userId, location } = this.parseJson(step2Text);
		if (!ssecurity || !userId || !location) {
			this.client.log('error', 'Login Step 2 Failed: Missing ssecurity, userId, or location.');
			throw new Error('Failed to sign in at step 2. Please sign in manually https://account.xiaomi.com/');
		}
		this.client.log('debug', 'Login Step 2: Got ssecurity and userId successfully');

		// --- Шаг 3: Получение serviceToken ---
		this.client.log('debug', 'Login Step 3: Fetching serviceToken from location');
		const step3Response = await fetch(location); // Упростил логику, location должен быть всегда
		if (!step3Response.ok)
			throw new Error(`Response step 3 error with status ${step3Response.statusText}`);
		const cookies = step3Response.headers.get('set-cookie');
		if (!cookies)
			throw new Error('Login step 3 failed: No set-cookie header found.');
		const serviceToken = cookies.match(/serviceToken=([^;]+)/)?.[1];
		if (!serviceToken) {
			this.client.log('error', 'Login Step 3 Failed: Could not extract serviceToken from cookies.');
			throw new Error('Login step 3 failed');
		}
		this.client.log('debug', 'Login Step 3: Got serviceToken successfully');

		// --- Завершение: Сохранение учетных данных ---
		this.client.log('info', `Login successful for user ${userId}`);
		this.credentials.ssecurity = ssecurity;
		this.credentials.userId = userId;
		this.credentials.serviceToken = serviceToken;
		this.client.emit('login', this.credentials);
	};

	/**
	 * Выполняет запрос к облачному API Xiaomi.
	 * @param {string} path Путь API запроса.
	 * @param {object} data Данные запроса.
	 * @returns {Promise<object>} Ответ API в формате JSON.
	 * @throws {Error} Если запрос завершился с ошибкой.
	 */
	async request(path, data) {
		this.client.log('debug', `Cloud request to ${path} with data:`, data);
		if (!this.credentials.serviceToken) {
			this.client.log('info', 'No serviceToken found, attempting login before request');
			await this.login();
		}
		if (!this.countries.includes(this.credentials.country))
			throw new Error(`The country ${this.credentials.country} is not support, list supported countries is ${this.countries.join(', ')}`);
		const params = {
			data: JSON.stringify(data)
		};
		const _nonce = this.generateNonce();
		const signedNonce = this.signedNonce(this.credentials.ssecurity, _nonce);
		const signature = this.generateSignature(path, signedNonce, _nonce, params);

		this.client.log('debug', `Sending cloud request to: ${this.getApiUrl(this.credentials.country)}${path}`);
		const controller = new AbortController();
		const timerId = setTimeout(() => controller.abort(), 5_000);
		try {
			const res = await fetch(this.getApiUrl(this.credentials.country) + path, {
				method: 'POST',
				signal: controller.signal,
				headers: {
					'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
					'Content-Type': 'application/x-www-form-urlencoded',
					Cookie: [
						`userId=${this.credentials.userId}`,
						`serviceToken=${this.credentials.serviceToken}`,
						`locale=${this.locale}`,
					].join('; '),
				},
				body: new URLSearchParams({
					signature, _nonce,
					data: params.data
				})
			});
			if (res.ok) {
				const result = await res.json();
				this.client.log('debug', `Cloud request to ${path} successful, result:`, result);
				this.client.log('info', `Cloud request to ${path} successful.`);
				return result;
			} else {
				this.client.log('error', `Cloud request to ${path} failed with status ${res.status} ${res.statusText}`);
				let errorBody = '';
				try {
					errorBody = await res.text();
				} catch (err) {}
				this.client.log('debug', `Cloud request error body: ${errorBody}`);
				throw new Error(`Request error with status ${res.statusText}`);
			}
		} catch (err) {
			if (err.name === 'AbortError') {
				this.client.log('error', `Cloud request to ${path} timed out after 5000ms`);
				throw new Error('Request timed out');
			}
			this.client.log('error', `Network error during cloud request to ${path}:`, err);
			throw err;
		} finally {
			clearTimeout(timerId);
		}
	};
};
