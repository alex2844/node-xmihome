import miio from 'mijia-io';
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import { COUNTRIES } from './constants.js';
import { expandPath } from './paths.js';
/** @import { Credentials, XiaomiMiHome } from './index.js' */

/**
 * Класс для взаимодействия с MiIO и облаком Xiaomi.
 */
export default class Miot {
	/**
	 * Находит спецификацию модели устройства на home.miot-spec.com.
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
		const actions = {};
		for (const s of /** @type {{ iid: number, type: string, description: string, properties?: any[], actions?: any[] }[]} */ (spec.services).slice(1)) {
			const skp = s.type.split(':');
			if (skp[1] === 'miot-spec-v2') {
				if (s.properties)
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
				if (s.actions)
					for (const a of /** @type {{ iid: number, type: string, in: any[] }[]} */ (s.actions)) {
						const akp = a.type.split(':');
						actions[`${skp[3]}_${akp[3]}`] = {
							siid: s.iid,
							aiid: a.iid,
							in: a.in
						};
					}
			}
		}
		return {
			name: spec.description,
			type: spec.type,
			properties, actions
		};
	};

	/**
	 * Локализация для запросов к облаку Xiaomi (по умолчанию 'en').
	 * @type {string}
	 */
	locale = 'en';

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
	 * @type {Credentials}
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
	 * Выполняет верификацию 2FA тикета.
	 * @param {string} notificationUrl URL для верификации.
	 * @param {string} ticket Код подтверждения от пользователя.
	 * @returns {Promise<string>} Финальный URL для получения serviceToken.
	 */
	async #verify2faTicket(notificationUrl, ticket) {
		this.client.log('debug', '2FA Step: Verifying ticket');

		// Шаг 1: Запрашиваем доступные методы верификации, чтобы получить cookie и определить правильный 'flag'
		const listUrl = notificationUrl.replace('authStart', 'list');
		const listResponse = await fetch(listUrl);
		const identityCookie = listResponse.headers.get('set-cookie');
		if (!identityCookie)
			throw new Error('2FA verification failed: Could not get identity_session cookie.');

		let listData = {};
		try {
			const responseText = await listResponse.text();
			listData = this.parseJson(responseText);
			this.client.log('debug', '2FA Step: Available methods response (JSON):', listData);
		} catch (e) {
			this.client.log('debug', '2FA Step: Could not parse methods response as JSON. Proceeding with default phone verification.');
		}

		const flag = listData?.flag || 4;
		const verifyPath = flag === 8 ? '/identity/auth/verifyEmail' : '/identity/auth/verifyPhone';
		this.client.log('debug', `2FA Step: Using verification method. Flag: ${flag}, Path: ${verifyPath}`);

		// Шаг 2: Теперь отправляем сам тикет на правильный эндпоинт с правильным флагом
		const verifyUrl = new URL(`https://account.xiaomi.com${verifyPath}`);
		verifyUrl.searchParams.set('_dc', String(Date.now()));

		const verifyResponse = await fetch(verifyUrl.toString(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
				'Cookie': identityCookie,
				'Accept': 'application/json',
				'x-requested-with': 'XMLHttpRequest'
			},
			body: new URLSearchParams({
				ticket,
				trust: 'true',
				_json: 'true',
				_flag: flag
			})
		});

		const verifyText = await verifyResponse.text();
		const verifyData = this.parseJson(verifyText);
		this.client.log('debug', '2FA Step: Verification response:', verifyData);

		if ((verifyData.code === 0) && verifyData.location) {
			this.client.log('debug', '2FA ticket verification successful.');
			return verifyData.location;
		} else {
			const errorDescription = verifyData.desc || verifyData.tips || 'Unknown error';
			throw new Error(`2FA verification failed: ${errorDescription} (Code: ${verifyData.code})`);
		}
	};

	/**
	 * Загружает учетные данные из файла.
	 * @returns {Promise<Credentials|null>}
	 */
	async #loadCredentials() {
		try {
			const data = await readFile(expandPath(this.client.config.credentialsFile), 'utf-8');
			return JSON.parse(data);
		} catch (error) {
			return null;
		}
	};

	/**
	 * Выполняет вход в аккаунт Xiaomi и возвращает учетные данные.
	 * @param {object} [handlers] - Объект с колбэками для обработки интерактивных шагов.
	 * @param {(url: string) => Promise<string>} [handlers.on2fa] - Колбэк для получения 2FA тикета.
	 * @returns {Promise<Omit<Credentials, 'username'|'password'>>} - Объект с полученными учетными данными.
	 * @throws {Error} Если не удалось выполнить вход на каком-либо из этапов.
	 */
	async login(handlers) {
		if (this.client.config.credentialsFile) {
			const credentials = await this.#loadCredentials();
			this.client.config.credentials = { ...credentials, ...this.credentials };
		}
		if (this.credentials.userId && this.credentials.ssecurity && this.credentials.serviceToken && this.credentials.country) {
			this.client.log('info', 'Credentials (tokens) already available, skipping login.');
			const { username, password, ...safeCredentials } = this.credentials;
			return safeCredentials;
		}
		this.client.log('info', `Attempting login for user: ${this.credentials.username}`);
		if (!this.credentials.username)
			throw new Error('username empty');
		if (!this.credentials.password)
			throw new Error('password empty');
		let ssecurity, userId, serviceToken;
		const serviceLoginUrl = 'https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true';
		const logHeaders = (/** @type {Headers} */ headers) => JSON.stringify(Object.fromEntries(headers.entries()), null, 2);
		const cookieJar = new Map();
		const updateCookieJar = (/** @type {string[]} */ newCookies) => {
			if (!newCookies?.length)
				return;
			for (const cookie of newCookies) {
				if (!cookie)
					continue;
				const name = cookie.split('=')[0].trim();
				if (cookie.includes('Max-Age=0') || cookie.toUpperCase().includes('EXPIRED')) {
					cookieJar.delete(name);
					this.client.log('debug', `[DEBUG] COOKIE JAR: Deleting expired cookie: ${name}`);
				} else {
					cookieJar.set(name, cookie);
					this.client.log('debug', `[DEBUG] COOKIE JAR: Setting/updating cookie: ${name}`);
				}
			}
		};
		const getCookieHeader = () => Array.from(cookieJar.values()).map(c => c.split(';')[0]).join('; ');
		const getCookieValue = (/** @type {string} */ name) => {
			const cookie = cookieJar.get(name);
			if (!cookie)
				return null;
			const valuePart = cookie.split(';')[0];
			return valuePart.substring(valuePart.indexOf('=') + 1);
		};
		this.client.log('debug', `[DEBUG] STEP 1: Fetching _sign from ${serviceLoginUrl}`);
		const step1Response = await fetch(serviceLoginUrl);
		this.client.log('debug', `[DEBUG] STEP 1: Response status: ${step1Response.status}`);
		this.client.log('debug', `[DEBUG] STEP 1: Response headers:\n${logHeaders(step1Response.headers)}`);
		updateCookieJar(step1Response.headers.getSetCookie?.() || [step1Response.headers.get('set-cookie')]);
		this.client.log('debug', `[DEBUG] STEP 1: Cookie Jar state:`, Object.fromEntries(cookieJar));
		const step1Data = this.parseJson(await step1Response.text());
		if (!step1Data._sign)
			throw new Error('Login step 1 failed: _sign not found');
		const sign = step1Data._sign;
		const step2Url = 'https://account.xiaomi.com/pass/serviceLoginAuth2';
		this.client.log('debug', `\n[DEBUG] STEP 2: Sending credentials to ${step2Url}`);
		this.client.log('debug', `[DEBUG] STEP 2: Sending with VALID Cookie header: ${getCookieHeader()}`);
		const step2Response = await fetch(step2Url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': getCookieHeader() },
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
		this.client.log('debug', `[DEBUG] STEP 2: Response status: ${step2Response.status}`);
		this.client.log('debug', `[DEBUG] STEP 2: Response headers:\n${logHeaders(step2Response.headers)}`);
		updateCookieJar(step2Response.headers.getSetCookie?.() || []);
		const step2Data = this.parseJson(await step2Response.text());
		this.client.log('debug', `[DEBUG] STEP 2: Response body:`, step2Data);
		if (step2Data.notificationUrl) {
			if (!handlers?.on2fa)
				throw new Error('Two-factor authentication is required, but no "on2fa" handler was provided.');
			const ticket = await handlers.on2fa(step2Data.notificationUrl);
			if (!ticket)
				throw new Error('2FA ticket was not provided. Login aborted.');
			let currentUrl = await this.#verify2faTicket(step2Data.notificationUrl, ticket);
			for (let i = 0; i < 10; i++) {
				this.client.log('debug', `\n[DEBUG] REDIRECT LOOP ${i}: Fetching URL: ${currentUrl}`);
				this.client.log('debug', `[DEBUG] REDIRECT LOOP ${i}: Sending with Cookie header: ${getCookieHeader()}`);
				const response = await fetch(currentUrl, { redirect: 'manual', headers: { 'Cookie': getCookieHeader() } });
				this.client.log('debug', `[DEBUG] REDIRECT LOOP ${i}: Response status: ${response.status}`);
				this.client.log('debug', `[DEBUG] REDIRECT LOOP ${i}: Response headers:\n${logHeaders(response.headers)}`);
				updateCookieJar(response.headers.getSetCookie?.() || []);
				if (!ssecurity && response.headers.has('extension-pragma')) {
					const pragma = response.headers.get('extension-pragma');
					try {
						ssecurity = JSON.parse(pragma).ssecurity;
						this.client.log('info', `[DEBUG] SUCCESS: ssecurity captured from extension-pragma header: ${ssecurity}`);
					} catch (e) {
						this.client.log('warn', 'Could not parse extension-pragma header as JSON', pragma);
					}
				}
				if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
					currentUrl = new URL(response.headers.get('location'), currentUrl).toString();
				} else {
					this.client.log('debug', `[DEBUG] REDIRECT LOOP ${i}: End of redirect chain.`);
					break;
				}
			}
			userId = getCookieValue('userId');
			serviceToken = getCookieValue('serviceToken');
		} else if (step2Data.ssecurity) {
			ssecurity = step2Data.ssecurity;
			userId = step2Data.userId;
			const step3Response = await fetch(step2Data.location);
			updateCookieJar(step3Response.headers.getSetCookie?.() || []);
			serviceToken = getCookieValue('serviceToken');
		} else
			throw new Error(`Login failed at Step 2. Server response: ${JSON.stringify(step2Data)}`);
		if (!ssecurity || !userId || !serviceToken) {
			this.client.log('error', `Login failed. ssecurity: ${!!ssecurity}, userId: ${!!userId}, serviceToken: ${!!serviceToken}`);
			this.client.log('debug', 'Final state of cookie jar:', Object.fromEntries(cookieJar));
			throw new Error(`Login failed: Could not retrieve all required credentials.`);
		}
		this.credentials.ssecurity = ssecurity;
		this.credentials.userId = userId;
		this.credentials.serviceToken = serviceToken;
		this.client.emit('login', this.credentials);
		return {
			userId, ssecurity, serviceToken,
			country: this.credentials.country
		};
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
		if (!COUNTRIES.includes(this.credentials.country))
			throw new Error(`The country ${this.credentials.country} is not support, list supported countries is ${COUNTRIES.join(', ')}`);
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
