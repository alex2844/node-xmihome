#!/usr/bin/env bash
set -euo pipefail

# -- КОНФИГУРАЦИЯ --
# Укажите провайдера: "gemini" или "openrouter"
readonly API_PROVIDER="${API_PROVIDER:-gemini}"

# Укажите ID модели в соответствии с выбранным провайдером
# Примеры для Gemini: "gemini-2.5-pro"
# Примеры для OpenRouter: "qwen/qwen3-coder:free", "openai/gpt-4o", "anthropic/claude-3-opus"
readonly MODEL_ID="${MODEL_ID:-gemini-2.5-pro}"

# -- ФАЙЛЫ И ИСКЛЮЧЕНИЯ --
readonly PROMPT_FILE="docs/prompts/docs.md"
readonly OUTPUT_SCRIPT="scripts/docs_apply.sh"
readonly EXCLUDE_FILES_PATTERNS=("LICENSE" ".gitignore" "${PROMPT_FILE}" "${OUTPUT_SCRIPT}" "${0#./}")

function error() {
	echo "❌ Ошибка: $1" >&2
	exit 1
}

function check_deps() {
	local missing_deps=0
	for dep in git curl jq; do
		if ! command -v "${dep}" &>/dev/null; then
			echo "❌ Утилита '${dep}' не найдена, но она необходима для работы скрипта." >&2
			missing_deps=1
		fi
	done
	if [[ ${missing_deps} -eq 1 ]]; then
		exit 1
	fi
}

function list_project_files() {
	git ls-files -c --others --exclude-standard
}

function process_file() {
	local relative_path="$1"
	echo "--- BEGIN FILE: ${relative_path} ---"

	local encoding=$(file -L -b --mime-encoding "${relative_path}")
	if [[ "${encoding}" == "binary" ]]; then
		echo "[Binary file, content not displayed]"
	else
		cat "${relative_path}" || echo "[Could not read file]"
	fi

	echo "--- END FILE: ${relative_path} ---"
	echo
}

function main() {
	echo "🔍 Работаем в корне проекта: ${PWD}"
	check_deps

	if [[ ! -f "${PROMPT_FILE}" ]]; then
		error "Файл с промптом не найден: '${PROMPT_FILE}'"
	fi

	echo "📦 Собираем контекст проекта в память..."
	local prompt_content=$(<"${PROMPT_FILE}")
	local project_context=""
	while IFS= read -r relative_path; do
		[[ -z "${relative_path}" ]] && continue
		local should_skip=false
		for pattern in "${EXCLUDE_FILES_PATTERNS[@]}"; do
			if [[ "${relative_path}" == ${pattern} ]]; then
				should_skip=true
				break
			fi
		done
		[[ "${should_skip}" == true ]] && continue
		project_context+="$(process_file "${relative_path}")"
	done < <(list_project_files | sort)
	echo "✅ Контекст собран. Объем: $(echo -n "${project_context}" | wc -c) байт."

	echo "🧠 Готовим запрос для '${API_PROVIDER}' (модель: ${MODEL_ID})..."
	local api_url=""
	local request_json=""
	local jq_parser_path=""
	local -a curl_headers=()

	case "${API_PROVIDER}" in
		gemini)
			if [[ -z "${GEMINI_API_KEY:-}" ]]; then
				error "Переменная окружения GEMINI_API_KEY не установлена."
			fi
			curl_headers=("-H" "Content-Type: application/json")
			api_url="https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_API_KEY}"
			jq_parser_path='.candidates[0].content.parts[0].text'
			request_json=$(echo "${project_context}" | jq -Rs \
				--arg prompt_content "${prompt_content}" \
				'{
					"contents": [{
						"parts": [
							{"text": $prompt_content},
							{"text": .}
						]
					}],
					"generationConfig": { "responseMimeType": "text/plain" }
				}'
			)
		;;
		openrouter)
			if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
				error "Переменная окружения OPENROUTER_API_KEY не установлена."
			fi
			curl_headers+=("-H" "Content-Type: application/json")
			curl_headers+=("-H" "Authorization: Bearer ${OPENROUTER_API_KEY}")
			api_url="https://openrouter.ai/api/v1/chat/completions"
			jq_parser_path='.choices[0].message.content'
			request_json=$(echo "${project_context}" | jq -Rs \
				--arg model "${MODEL_ID}" \
				--arg prompt_content "${prompt_content}" \
				'{
					"model": $model,
					"messages": [
						{"role": "system", "content": $prompt_content},
						{"role": "user", "content": .}
					]
				}'
			)
		;;
		*) error "Неизвестный API_PROVIDER: '${API_PROVIDER}'. Допустимые значения: 'gemini' или 'openrouter'.";;
	esac

	if ! [[ -n "${request_json}" ]]; then
		error "Не удалось сгенерировать JSON для запроса с помощью jq."
	fi
	
	echo "🚀 Отправляем запрос в ${API_PROVIDER}... Это может занять некоторое время."
	local response
	if ! response=$(echo "${request_json}" | curl -s -X POST "${curl_headers[@]}" --data-binary @- "${api_url}" 2>&1); then
		error "Запрос к ${API_PROVIDER} API не удался. Ответ сервера:\n${response}"
	fi
	if ! echo "${response}" | jq -e "${jq_parser_path}" > /dev/null; then
		error "Получен некорректный ответ от ${API_PROVIDER} (отсутствует ожидаемый текст). Ответ API:\n${response}"
	fi

	local generated_script=$(echo "${response}" | jq -r "${jq_parser_path}" \
		| sed -e '1s/^```\(bash\|sh\)$//' -e '$s/^```$//' \
		| sed -e '/./,$!d' \
		| tee "${OUTPUT_SCRIPT}"
	)
	
	if [[ -z "${generated_script}" ]]; then
		error "Получен пустой скрипт от ${API_PROVIDER}. Проверьте ответ API:\n${response}"
	fi

	chmod +x "${OUTPUT_SCRIPT}"
	echo "🎉 Скрипт для обновления документации успешно сгенерирован и сохранен в: ${OUTPUT_SCRIPT}"
}

main "$@"
