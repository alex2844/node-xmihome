/**
 * Приостанавливает выполнение на указанное количество миллисекунд.
 * @param {number} ms Количество миллисекунд для ожидания.
 * @param {AbortSignal} [signal] Опциональный AbortSignal для отмены ожидания.
 * @returns {Promise<void>} Promise, который разрешается после указанной задержки.
 * @throws {Error} Если ожидание было отменено сигналом.
 */
export function sleep(ms, signal = undefined) {
	return new Promise((resolve, reject) => {
		const timerId = setTimeout(resolve, ms);
		if (signal) {
			const abortHandler = () => {
				clearTimeout(timerId);
				reject(new Error('Operation cancelled'));
			};
			signal.addEventListener('abort', abortHandler, { once: true });
			const cleanup = () => signal.removeEventListener('abort', abortHandler);
			const promise = Promise.resolve();
			promise.then(cleanup, cleanup);
		}
	});
};

/**
 * Сливает два объекта. Свойства из `priorityObj` имеют приоритет,
 * но только если их значение не `undefined`.
 * @param {object} [priority={}] - Объект, чьи значения в приоритете.
 * @param {object} [base={}] - Базовый объект со значениями по умолчанию.
 * @param {string[]} [exclude=[]] - Массив ключей, которые нужно игнорировать в `priority` объекте.
 * @returns {object} Новый объединенный объект.
 */
export function mergePreferDefined(priority = {}, base = {}, exclude = []) {
	const definedPriorityValues = Object.fromEntries(
		Object.entries(priority).filter(([key, value]) => ((value !== undefined) && !exclude.includes(key)))
	);
	return { ...base, ...definedPriorityValues };
};

/**
 * Создает Proxy-обертку, которая объединяет два объекта.
 * @template {object} T
 * @template {object} F
 * @param {T} target - Основной объект, который может переопределять методы.
 * @param {F} fallback - Запасной объект, который предоставляет базовую функциональность.
 * @returns {T & F} Готовый к использованию прокси-объект.
 */
export function createFallbackProxy(target, fallback) {
	if ((typeof target !== 'object') || (target === null))
		throw new TypeError('Proxy target must be an object.');
	if ((typeof fallback !== 'object') || (fallback === null))
		throw new TypeError('Proxy fallback must be an object.');
	const proxy = new Proxy(target, {
		get(target, prop, receiver) {
			if (prop in target)
				return Reflect.get(target, prop, receiver);
			// @ts-ignore
			const fallbackProp = fallback[prop];
			if (typeof fallbackProp === 'function')
				return fallbackProp.bind(fallback);
			return fallbackProp;
		}
	});
	return /** @type {T & F} */ (proxy);
};
