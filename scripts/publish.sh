#!/usr/bin/env bash
set -euo pipefail

readonly PACKAGES_DIR="packages"
readonly NODERED_FLOWS_URL="https://flows.nodered.org/add/node"

function error() {
	echo "❌ Ошибка: $1" >&2
	exit 1
}

function check_deps() {
	local missing_deps=0
	for dep in jq bun curl; do
		if ! command -v "${dep}" &>/dev/null; then
			echo "❌ Утилита '${dep}' не найдена, но она необходима для работы скрипта." >&2
			missing_deps=1
		fi
	done
	if [[ ${missing_deps} -eq 1 ]]; then
		exit 1
	fi
}

function refresh_nodered_flow() {
	local pkg_file="$1"
	local pkg_name=$(jq -r '.name' "${pkg_file}")
	echo "   - 🟡 Это пакет Node-RED. Обновление на flows.nodered.org..."
	local headers_file=$(mktemp)
	local response_body=$(curl -s -D "${headers_file}" "${NODERED_FLOWS_URL}")
	local cookie=$(grep -oP '_csrf=.*?;' "${headers_file}" | head -n 1 || true)
	local csrf_token=$(echo "${response_body}" | grep -oP 'name="_csrf" type="hidden" value="\K[^"]+' || true)
	rm -f "${headers_file}"
	if [[ -z "${cookie}" ]] || [[ -z "${csrf_token}" ]]; then
		echo "   - ⚠️ Не удалось получить CSRF-токен или cookie с сайта Node-RED. Обновление пропущено."
		return
	fi
	local post_response=$(
		curl -sL -X POST \
			-H "cookie: ${cookie}" \
			--data-urlencode "_csrf=${csrf_token}" \
			--data-urlencode "module=${pkg_name}" \
			"${NODERED_FLOWS_URL}"
	)
	if [[ "${post_response,,}" == *"added"* ]] || [[ "${post_response,,}" == *"updated"* ]]; then
		echo "   - ✅ Обновление на Node-RED Flows завершено."
	else
		echo "   - ⚠️ Не удалось обновить модуль в Node-RED. Ответ сервера не содержит подтверждения."
		echo "   - Ответ сервера: ${post_response}"
	fi
}

function process_package() {
	local version="$2"
	local pkg_dir="$1"
	local pkg_file="${pkg_dir}/package.json"
	echo "🔄 Обработка пакета: ${pkg_dir}"
	local json=$(jq --tab --arg version "${version}" '.version = $version' "${pkg_file}")
	echo "${json}" >"${pkg_file}"
	if [[ "$(jq -r '.private // false' "${pkg_file}")" != "true" ]]; then
		echo "   - 📦 Пакет публичный. Публикация..."
		(cd "${pkg_dir}" && bun publish)
		echo "   - ✅ Опубликован."
		if jq -e '."node-red"' "${pkg_file}" >/dev/null; then
			refresh_nodered_flow "${pkg_file}"
		fi
	else
		echo "   - ⚪️ Пакет приватный. Публикация пропущена."
	fi
}

function main() {
	echo "🔍 Работаем в корне проекта: ${PWD}"
	check_deps
	if [[ ! -f "package.json" ]]; then
		error "Корневой файл 'package.json' не найден. Запустите скрипт из корня монорепозитория."
	fi
	echo "ℹ️  Чтение версии из корневого package.json..."
	local version=$(jq -r '.version // empty' package.json)
	if [[ -z "${version}" ]]; then
		error "Не удалось прочитать поле 'version' из корневого package.json."
	fi
	echo "✅ Обнаружена корневая версия: ${version}"
	echo
	for pkg_dir in "${PACKAGES_DIR}"/*; do
		if [[ -d "${pkg_dir}" && -f "${pkg_dir}/package.json" ]]; then
			process_package "${pkg_dir}" "${version}"
			echo
		fi
	done
	echo "🎉 Скрипт завершил работу."
}

main "$@"
