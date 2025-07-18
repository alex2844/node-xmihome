#!/usr/bin/env bash
set -euo pipefail

readonly PROMPT_FILE="docs/GEMINI.md"
readonly OUTPUT_SCRIPT="scripts/docs_apply.sh"
readonly EXCLUDE_FILES_PATTERNS=("LICENSE" ".gitignore" "${PROMPT_FILE}" "${OUTPUT_SCRIPT}" "${0#./}")
readonly MODEL_ID="gemini-2.5-pro"

function error() {
	echo "❌ Ошибка: $1" >&2
	exit 1
}

function check_deps() {
	local missing_deps=0
	for dep in git curl jq base64; do
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

function generate_request_json() {
	jq -n \
		--arg prompt_b64 "$1" \
		--arg context_b64 "$2" \
		'{
			"contents": [
				{
					"role": "user",
					"parts": [
						{
							"inlineData": { "mimeType": "text/plain", "data": $prompt_b64 }
						}, {
							"inlineData": { "mimeType": "text/plain", "data": $context_b64 }
						}
					]
				}
			],
			"generationConfig": {
				"responseMimeType": "text/plain"
			}
		}'
}

function main() {
	echo "🔍 Работаем в корне проекта: ${PWD}"

	check_deps
	if [[ -z "${GEMINI_API_KEY:-}" ]]; then
		error "Переменная окружения GEMINI_API_KEY не установлена."
	fi
	if [[ ! -f "${PROMPT_FILE}" ]]; then
		error "Файл с промптом не найден: '${PROMPT_FILE}'"
	fi

	echo "📦 Собираем контекст проекта в память..."
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
	echo "🤖 Отправляем запрос в Gemini AI (модель: ${MODEL_ID})... Это может занять некоторое время."

	local prompt_base64=$(base64 -w0 < "${PROMPT_FILE}")
	local context_base64=$(base64 -w0 <<< "${project_context}")
	local request_json=$(generate_request_json "${prompt_base64}" "${context_base64}")
	local api_url="https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_API_KEY}"

	local response
	if ! response=$(curl -s -X POST -H "Content-Type: application/json" --data-binary @- "${api_url}" <<< "${request_json}" 2>&1); then
		error "Запрос к Gemini API не удался. Ответ сервера:\n${response}"
	fi
	if ! echo "${response}" | jq -e '.candidates[0].content.parts[0].text' > /dev/null; then
		error "Получен некорректный ответ от Gemini (отсутствует текст). Ответ API:\n${response}"
	fi

	local generated_script=$(echo "${response}" | jq -r '.candidates[0].content.parts[0].text' \
		| sed -e '1s/^```\(bash\|sh\)$//' -e '$s/^```$//' \
		| sed -e '/./,$!d' \
		| tee "${OUTPUT_SCRIPT}"
	)
	if [[ -z "${generated_script}" ]]; then
		error "Получен пустой скрипт от Gemini. Проверьте ответ API:\n${response}"
	fi

	chmod +x "${OUTPUT_SCRIPT}"
	echo "✅ Скрипт для обновления документации успешно сгенерирован и сохранен в: ${OUTPUT_SCRIPT}"
}

main "$@"
