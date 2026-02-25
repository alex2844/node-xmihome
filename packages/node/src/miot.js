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
	 * @param {(imageB64: string) => Promise<string>} [handlers.onCaptcha] - Колбэк для разгадывания капчи.
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

		let currentUrl, ssecurity, userId, serviceToken;
		const serviceLoginUrl = 'https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true';
		const userAgent = 'APP/com.xiaomi.mihome APPV/10.5.201';

		const cookieJar = new Map();
		const updateCookieJar = (/** @type {Headers} */ responseHeaders) => {
			const setCookie = responseHeaders.getSetCookie?.() || [responseHeaders.get('set-cookie')];
			if (!setCookie?.length)
				return;
			for (const cookie of setCookie) {
				if (!cookie)
					continue;
				const parts = cookie.split(';');
				const cookiePair = parts[0].split('=');
				if (cookiePair.length < 2)
					continue;
				const [name, ...valueParts] = cookiePair;
				const value = valueParts.join('=');
				if (cookie.toLowerCase().includes('max-age=0') || cookie.toLowerCase().includes('expires='))
					cookieJar.delete(name.trim());
				else if (name && value)
					cookieJar.set(name.trim(), parts[0]);
			}
			this.client.log('debug', `Cookie JAR updated:`, Object.fromEntries(cookieJar));
		};

		const getCookieHeader = () => Array.from(cookieJar.values()).join('; ');
		const getCookieValue = (/** @type {string} */ name) => {
			const cookie = cookieJar.get(name);
			if (!cookie)
				return null;
			const valuePart = cookie.split(';')[0];
			return valuePart.substring(valuePart.indexOf('=') + 1);
		};

		this.client.log('debug', `Fetching _sign from ${serviceLoginUrl}`);
		const step1Response = await fetch(serviceLoginUrl, { headers: { 'User-Agent': userAgent, 'Cookie': getCookieHeader() } });
		updateCookieJar(step1Response.headers);
		this.client.log('debug', `Response status: ${step1Response.status}`);

		const step1Data = this.parseJson(await step1Response.text());
		if (!step1Data._sign)
			throw new Error('Login step 1 failed: _sign not found');

		const sign = step1Data._sign;
		const step2Url = 'https://account.xiaomi.com/pass/serviceLoginAuth2';
		let step2Data;

		let captCode = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			this.client.log('debug', `Sending credentials to ${step2Url} (Attempt ${attempt + 1})`);
			const body = new URLSearchParams({
				user: this.credentials.username,
				hash: crypto.createHash('md5').update(this.credentials.password).digest('hex').toUpperCase(),
				_json: 'true',
				sid: 'xiaomiio',
				callback: 'https://sts.api.io.mi.com/sts',
				qs: '%3Fsid%3Dxiaomiio%26_json%3Dtrue',
				_sign: sign
			});
			if (captCode)
				body.append('captCode', captCode);

			const step2Response = await fetch(step2Url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': userAgent, 'Cookie': getCookieHeader() },
				body
			});
			updateCookieJar(step2Response.headers);
			this.client.log('debug', `Response status: ${step2Response.status}`);

			step2Data = this.parseJson(await step2Response.text());
			this.client.log('debug', `Response body:`, step2Data);

			if (step2Data.captchaUrl) {
				if (!handlers?.onCaptcha)
					throw new Error('Captcha is required, but no "onCaptcha" handler was provided.');
				this.client.log('debug', `Captcha required. Fetching image from ${step2Data.captchaUrl}`);

				const captchaResponse = await fetch(`https://account.xiaomi.com${step2Data.captchaUrl}`, {
					headers: { 'User-Agent': userAgent, 'Cookie': getCookieHeader() }
				});
				updateCookieJar(captchaResponse.headers);

				const captchaBuffer = await captchaResponse.arrayBuffer();
				const captchaBase64 = Buffer.from(captchaBuffer).toString('base64');
				const dataUri = `data:image/jpeg;base64,${captchaBase64}`;

				captCode = await handlers.onCaptcha(dataUri);
				if (!captCode)
					throw new Error('Captcha code was not provided. Login aborted.');
				continue;
			}
			break;
		}

		if (step2Data.notificationUrl) {
			if (!handlers?.on2fa)
				throw new Error('Two-factor authentication is required, but no "on2fa" handler was provided.');
			const context = new URL(step2Data.notificationUrl).searchParams.get('context');

			this.client.log('debug', '2FA Step: Listing verification methods to prime session.');
			const listUrl = new URL('https://account.xiaomi.com/identity/list');
			listUrl.searchParams.set('sid', 'xiaomiio');
			listUrl.searchParams.set('context', context);
			listUrl.searchParams.set('_locale', 'en_US');
			const listResponse = await fetch(listUrl.toString(), { headers: { 'User-Agent': userAgent, 'Cookie': getCookieHeader() } });
			updateCookieJar(listResponse.headers);
			const listData = this.parseJson(await listResponse.text());
			this.client.log('debug', '2FA Step: Identity list response:', listData);

			const flag = listData.flag === 4 ? 4 : 8;
			const authType = flag === 4 ? 'Phone' : 'Email';
			const sendEndpoint = `send${authType}Ticket`;
			const verifyEndpoint = `verify${authType}`;
			this.client.log('debug', `2FA Step: Detected verification method: ${authType} (flag: ${flag})`);

			this.client.log('debug', '2FA Step: Attempting to request verification code.');
			const sendUrl = new URL(`https://account.xiaomi.com/identity/auth/${sendEndpoint}`);
			sendUrl.searchParams.set('_dc', String(Date.now()));
			const sendResponse = await fetch(sendUrl.toString(), {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': userAgent, 'Cookie': getCookieHeader() },
				body: new URLSearchParams({
					context,
					sid: 'xiaomiio',
					_json: 'true',
					ick: getCookieValue('ick') || ''
				})
			});
			updateCookieJar(sendResponse.headers);
			const sendData = this.parseJson(await sendResponse.text());
			this.client.log('debug', `2FA Step: "${sendEndpoint}" response:`, sendData);

			if (sendData.code === 0 && sendData.location) {
				this.client.log('info', '2FA Step: Server skipped code verification, proceeding directly.');
				currentUrl = sendData.location;
			} else if (sendData.code === 0) {
				const ticket = await handlers.on2fa(step2Data.notificationUrl);
				if (!ticket)
					throw new Error('2FA ticket was not provided. Login aborted.');

				this.client.log('debug', '2FA Step: Verifying ticket.');
				const verifyUrl = new URL(`https://account.xiaomi.com/identity/auth/${verifyEndpoint}`);
				verifyUrl.searchParams.set('_json', 'true');
				const verifyResponse = await fetch(verifyUrl.toString(), {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': userAgent, 'Cookie': getCookieHeader() },
					body: new URLSearchParams({
						ticket, context,
						trust: 'true',
						_json: 'true',
						_flag: String(flag)
					})
				});
				updateCookieJar(verifyResponse.headers);

				const verifyData = this.parseJson(await verifyResponse.text());
				this.client.log('debug', '2FA Step: Verification response:', verifyData);
				if (verifyData.code !== 0 || !verifyData.location)
					throw new Error(`2FA verification failed: ${verifyData.tips || verifyData.desc || 'Unknown error'}`);
				currentUrl = verifyData.location;
			} else
				throw new Error(`Failed to request 2FA code: ${sendData.tips || sendData.desc}`);

			this.client.log('debug', '2FA Step: Following redirect chain.');
			for (let i = 0; i < 10; i++) {
				this.client.log('debug', `REDIRECT LOOP ${i}: Fetching URL: ${currentUrl}`);
				const redirectResponse = await fetch(currentUrl, { redirect: 'manual', headers: { 'User-Agent': userAgent, 'Cookie': getCookieHeader() } });
				updateCookieJar(redirectResponse.headers);

				const pragma = redirectResponse.headers.get('extension-pragma');
				if (pragma)
					try {
						const pragmaJson = JSON.parse(pragma);
						if (pragmaJson.ssecurity) {
							ssecurity = pragmaJson.ssecurity;
							this.client.log('info', `SUCCESS: ssecurity captured: ${ssecurity}`);
						}
					} catch (e) {
						this.client.log('warn', 'Could not parse extension-pragma header', pragma);
					}

				if (redirectResponse.status >= 300 && redirectResponse.status < 400 && redirectResponse.headers.has('location'))
					currentUrl = new URL(redirectResponse.headers.get('location'), currentUrl).toString();
				else {
					this.client.log('debug', `End of redirect chain at loop ${i}.`);
					break;
				}
			}
			userId = getCookieValue('userId');
			serviceToken = getCookieValue('serviceToken');
		} else if (step2Data.ssecurity) {
			ssecurity = step2Data.ssecurity;
			userId = step2Data.userId;
			const step3Response = await fetch(step2Data.location, { headers: { 'User-Agent': userAgent, 'Cookie': getCookieHeader() } });
			updateCookieJar(step3Response.headers);
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
