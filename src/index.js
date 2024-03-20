#!/usr/bin/env node

const EventEmitter = require('events');
const querystring = require('querystring');
const crypto = require('crypto');
const miio = require('miio');

class MiHome extends EventEmitter {
	constructor(credentials={}) {
		super();
		this.credentials = credentials;
		this.type = ((credentials.username && credentials.password) ? 'web' : 'lan');
		this.locale = 'en';
		this.countries = [ 'sg', 'cn', 'ru', 'us', 'tw', 'de' ];
	}
	parseJson(str) {
		if (str.indexOf('&&&START&&&') === 0)
			str = str.replace('&&&START&&&', '');
		return JSON.parse(str);
	}
	getApiUrl(country) {
		return `https://${country === 'cn' ? '' : `${country}.`}api.io.mi.com/app`;
	}
	generateSignature(path, _signedNonce, nonce, params) {
		const exps = [ path, _signedNonce, nonce ];
		const paramKeys = Object.keys(params);
		paramKeys.sort();
		for (let i = 0, { length } = paramKeys; i < length; i++) {
			const key = paramKeys[i];
			exps.push(`${key}=${params[key]}`);
		}
		return crypto.createHmac('sha256', Buffer.from(_signedNonce, 'base64')).update(exps.join('&')).digest('base64');
	}
	generateNonce() {
		const buf = Buffer.allocUnsafe(12);
		buf.write(crypto.randomBytes(8).toString('hex'), 0, 'hex');
		buf.writeInt32BE(parseInt(Date.now() / 60000, 10), 8);
		return buf.toString('base64');
	}
	signedNonce(ssecret, nonce) {
		const s = Buffer.from(ssecret, 'base64');
		const n = Buffer.from(nonce, 'base64');
		return crypto.createHash('sha256').update(s).update(n).digest('base64');
	}
	async login() {
		if (!this.credentials.username)
			throw new Error('username empty');
		if (!this.credentials.password)
			throw new Error('password empty');
		const { sign } = await this._loginStep1();
		const { ssecurity, userId, location } = await this._loginStep2(this.credentials.username, this.credentials.password, sign);
		const { serviceToken } = await this._loginStep3(sign.indexOf('http') === -1 ? location : sign);
		this.emit('login', this.credentials);
	}
	async _loginStep1() {
		const url = 'https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true';
		const res = await fetch(url);

		const content = await res.text();
		const { statusText } = res;

		if (!res.ok)
			throw new Error(`Response step 1 error with status ${statusText}`);

		const data = this.parseJson(content);

		if (!data._sign)
			throw new Error('Login step 1 failed');

		return {
			sign: data._sign,
		};
	}
	async _loginStep2(username, password, sign) {
		const formData = querystring.stringify({
			hash: crypto.createHash('md5').update(password).digest('hex').toUpperCase(),
			_json: 'true',
			sid: 'xiaomiio',
			callback: 'https://sts.api.io.mi.com/sts',
			qs: '%3Fsid%3Dxiaomiio%26_json%3Dtrue',
			_sign: sign,
			user: username,
		});

		const url = 'https://account.xiaomi.com/pass/serviceLoginAuth2';
		const res = await fetch(url, {
			method: 'POST',
			body: formData,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		});

		const content = await res.text();
		const { statusText } = res;

		if (!res.ok)
			throw new Error(`Response step 2 error with status ${statusText}`);

		const { ssecurity, userId, location } = this.parseJson(content);

		if (!ssecurity || !userId || !location)
			throw new Error('Login step 2 failed');

		this.credentials.ssecurity = ssecurity; // Buffer.from(data.ssecurity, 'base64').toString('hex');
		this.credentials.userId = userId;
		return { ssecurity, userId, location };
	}
	async _loginStep3(location) {
		const url = location;
		const res = await fetch(url);

		const content = await res.text();
		const { statusText } = res;

		if (!res.ok)
			throw new Error(`Response step 3 error with status ${statusText}`);

		let serviceToken;
		res.headers.get('set-cookie').split(', ').forEach(cookieStr => {
			const cookie = cookieStr.split('; ')[0];
			const idx = cookie.indexOf('=');
			const key = cookie.substr(0, idx);
			const value = cookie.substr(idx + 1, cookie.length).trim();
			if (key === 'serviceToken')
				serviceToken = value;
		});
		if (!serviceToken)
			throw new Error('Login step 3 failed');

		this.credentials.serviceToken = serviceToken;
		return { serviceToken };
	}
	async request(path, data, country='cn') {
		if (!this.credentials.serviceToken)
			await this.login();
		if (!this.countries.includes(country))
			throw new Error(`The country ${country} is not support, list supported countries is ${this.countries.join(', ')}`);
		const url = this.getApiUrl(country) + path;
		const params = {
			data: JSON.stringify(data),
		};
		const nonce = this.generateNonce();
		const signedNonce = this.signedNonce(this.credentials.ssecurity, nonce);
		const signature = this.generateSignature(path, signedNonce, nonce, params);
		const body = {
			_nonce: nonce,
			data: params.data,
			signature,
		};

		const res = await fetch(url, {
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
			body: querystring.stringify(body),
		});

		if (!res.ok)
			throw new Error(`Request error with status ${res.statusText}`);

		const json = await res.json();
		return json;
	}
	getHome() {
		return this.request('/v2/homeroom/gethome', {
			fg: true,
			fetch_share: true,
			fetch_share_dev: true,
			limit: 300,
			app_ver: 7
		}, this.credentials.country).then(({ result }) => result.homelist);
	}
	getEnv(home_id) {
		return this.request('/v2/home/get_env_data', {
			home_id,
			timestamp: parseInt(Date.now()/1000)-300,
			prop_event_device: [ 'temp', 'hum', 'pm25' ]
		}, this.credentials.country).then(({ result }) => result);
	}
	getSceneList(home_id) { // empty result?
		return this.request('/appgateway/miot/appsceneservice/AppSceneService/GetSceneList', { home_id }, this.credentials.country).then(({ result }) => result);
	}
	runSceneList(scene_id) {
		return this.request('/appgateway/miot/appsceneservice/AppSceneService/RunScene', {
			scene_id,
			trigger_key: 'user.click'
		}, this.credentials.country).then(({ result }) => result);
	}
	getDevices(tokens) {
		if (this.type === 'web')
			return this.request('/home/device_list', {}, this.credentials.country).then(({ result }) => {
				return result.list.filter(({ localip, isOnline}) => (localip && isOnline)).map(({ did, token, localip, name, model }) => ({
					id: +did,
					address: localip,
					token, name, model
				}));
			});
		else
			return new Promise(resolve => {
				const browser = miio.browse();
				const devices = [];
				browser.on('available', reg => {
					if (reg.id && !reg.token)
						reg.token = tokens?.find(device => (device.id === reg.id))?.token;
					devices.push(reg);
				});
				setTimeout(() => {
					browser.stop();
					resolve(devices);
				}, 1000);
			});
	}
	async getDevice({ id, address, token }, method, params) {
		if ((this.type === 'web') && id) {
			const device = await this.getDevices().then(devices => devices.find(device => (device.id == id)));
			if (device) {
				if (device.model)
					device.spec = `https://home.miot-spec.com/spec/${device.model}`;
				if (method) {
					device.method = method;
					device.params = await this.request(`/home/rpc/${id}`, {
						method, params
					}, this.credentials.country).then(({ result }) => result);
				}
			}
			return device;
		}else if (address && token) {
			const conn = await miio.device({ address, token });
			const device = {
				id, address, token,
				model: conn.miioModel
			};
			if (device) {
				if (device.model)
					device.spec = `https://home.miot-spec.com/spec/${device.model}`;
				if (method) {
					device.method = method;
					device.params = await conn.call(method, params);
				}
			}
			conn.destroy();
			return device;
		}
	}
}

module.exports = MiHome;
