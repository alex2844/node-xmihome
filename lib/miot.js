import crypto from 'crypto';
import miio from 'miio';

/**
 * Класс для взаимодействия с MiIO и облаком Xiaomi.
 */
class Miot {
	/**
	 * Находит спецификацию модели устройства на miot-spec.org.
	 * @static
	 * @async
	 * @param {string} model Модель устройства.
	 * @returns {Promise<object|undefined>} Объект спецификации модели или `undefined`, если модель не найдена.
	 */
	static async findModel(model) {
		this.client?.log('debug', `Searching for model spec on miot-spec.org: ${model}`);
		const { instances } = await fetch('https://miot-spec.org/miot-spec-v2/instances?status=released').then(res => res.json());
		const instance = instances.sort((a, b) => (b.ts - a.ts)).find(instance => instance.model === model);
		if (!instance) {
			this.client?.log('debug', `Model spec not found for: ${model}`);
			return;
		}
		const spec = await fetch(`https://miot-spec.org/miot-spec-v2/instance?type=${instance.type}`).then(res => res.json());
		const properties = {};
		spec.services.slice(1).forEach(service => {
			const skp = service.type.split(':');
			if (skp[1] === 'miot-spec-v2')
				service.properties.forEach(prop => {
					const pkp = prop.type.split(':');
					if (prop.access.length)
						properties[`${skp[3]}_${pkp[3]}`] = {
							siid: service.iid,
							piid: prop.iid,
							format: prop.format,
							access: prop.access
						};
				});
		});
		this.client?.log('info', `Model spec found and parsed for: ${model}`);
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
	countries = [ 'sg', 'cn', 'ru', 'us', 'tw', 'de' ];

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
	 * @readonly
	 */
	get credentials() {
		return this.client.config.credentials || {};
	};

	/**
	 * Возвращает модуль miio для прямого взаимодействия с MiIO устройствами.
	 * @type {object}
	 * @readonly
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
		const exps = [ path, _signedNonce, nonce ];
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
		buf.writeInt32BE(parseInt(Date.now() / 60000, 10), 8);
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
	 * @async
	 * @throws {Error} Если не удалось выполнить вход на каком-либо из этапов.
	 */
	async login() {
		this.client.log('info', `Attempting login for user: ${this.credentials.username}`);
		if (!this.credentials.username)
			throw new Error('username empty');
		if (!this.credentials.password)
			throw new Error('password empty');

		this.client.log('debug', 'Login Step 1: Fetching _sign');
		const sign = await fetch('https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true').then(res => {
			if (!res.ok)
				throw new Error(`Response step 1 error with status ${res.statusText}`);
			return res.text().then(this.parseJson.bind(this)).then(data => {
				this.client.log('debug', 'Login Step 1: Got _sign successfully');
				if (data._sign)
					return data._sign;
				throw new Error('Login step 1 failed');
			})
		});

		this.client.log('debug', 'Login Step 2: Sending credentials');
		const { ssecurity, userId, location } = await fetch('https://account.xiaomi.com/pass/serviceLoginAuth2', {
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
		}).then(res => {
			if (!res.ok)
				throw new Error(`Response step 2 error with status ${res.statusText}`);
			return res.text().then(this.parseJson.bind(this));
		});
		if (!ssecurity || !userId || !location) {
			this.client.log('error', 'Login Step 2 Failed: Missing ssecurity, userId, or location.');
			throw new Error('Failed to sign in at step 2. Please sign in manually https://account.xiaomi.com/');
		}
		this.client.log('debug', 'Login Step 2: Got ssecurity and userId successfully');

		this.client.log('debug', 'Login Step 3: Fetching serviceToken from location/sign');
		const serviceToken = await fetch(sign.indexOf('http') === -1 ? location : sign).then(res => {
			if (!res.ok)
				throw new Error(`Response step 3 error with status ${res.statusText}`);
			let serviceToken;
			res.headers.get('set-cookie').split(', ').forEach(cookieStr => {
				const cookie = cookieStr.split('; ')[0];
				const idx = cookie.indexOf('=');
				const key = cookie.slice(0, idx);
				const value = cookie.slice(idx + 1).trim();
				if (key === 'serviceToken')
					serviceToken = value;
			});
			if (serviceToken)
				return serviceToken;
			this.client.log('error', 'Login Step 3 Failed: Could not extract serviceToken from cookies.');
			throw new Error('Login step 3 failed');
		});
		this.client.log('debug', 'Login Step 3: Got serviceToken successfully');
		this.client.log('info', `Login successful for user ${userId}`);

		this.credentials.ssecurity = ssecurity; // Buffer.from(data.ssecurity, 'base64').toString('hex');
		this.credentials.userId = userId;
		this.credentials.serviceToken = serviceToken;
		this.client.emit('login', this.credentials);
	};

	/**
	 * Выполняет запрос к облачному API Xiaomi.
	 * @async
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
			data: JSON.stringify(data),
		};
		const _nonce = this.generateNonce();
		const signedNonce = this.signedNonce(this.credentials.ssecurity, _nonce);
		const signature = this.generateSignature(path, signedNonce, _nonce, params);

		this.client.log('debug', `Sending cloud request to: ${this.getApiUrl(this.credentials.country)}${path}`);
		try {
			const res = await fetch(this.getApiUrl(this.credentials.country) + path, {
				method: 'POST',
				timeout: 5000,
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
			this.client.log('error', `Network error during cloud request to ${path}:`, err);
			throw err;
		}
	};
};
export default Miot;
