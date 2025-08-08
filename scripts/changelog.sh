#!/usr/bin/env bash
set -euo pipefail

function usage() {
	echo "Использование: $0 [-t <tag>] [-o <output_file>] [-h]"
	echo "  -t <tag>            Тег, для которого генерируется changelog (по умолчанию: последний тег)."
	echo "  -o <output_file>    Файл для сохранения результата (по умолчанию: вывод на экран)."
	echo "  -h                  Показать эту справку."
}

function error() {
	echo "❌ Ошибка: $1" >&2
	exit 1
}

function check_deps() {
	local missing_deps=0
	for dep in jq git curl awk; do
		if ! command -v "${dep}" &>/dev/null; then
			echo "❌ Утилита '${dep}' не найдена, но она необходима для работы скрипта." >&2
			missing_deps=1
		fi
	done
	if [[ ${missing_deps} -eq 1 ]]; then
		exit 1
	fi
}

function get_commits() {
	local include_pattern="$1"
	local exclude_pattern="${2:-}"
	local all_commits="$3"
	local commits=$(echo "${all_commits}" | grep -E "${include_pattern}" || true)
	if [[ -n "${exclude_pattern}" ]]; then
		commits=$(echo "${commits}" | grep -E -v "${exclude_pattern}" || true)
	fi
	[[ -n "${commits}" ]] && echo "${commits}"
}

function main() {
	local output_file=""
	local target_tag_arg=""

	while getopts ":o:t:h" opt; do
		case ${opt} in
			o ) output_file=${OPTARG};;
			t ) target_tag_arg=${OPTARG};;
			h ) usage; exit 0;;
			\? ) error "Неверный флаг: -${OPTARG}. Используйте -h для справки." ;;
			: ) error "Флаг -${OPTARG} требует аргумент (имя файла или тега)." ;;
		esac
	done

	check_deps

	echo "🔍 Поиск токена GitHub..."
	local token
	if [[ -n "${GITHUB_TOKEN:-}" ]]; then
		token="${GITHUB_TOKEN}"
		echo "   - ✅ Найден в переменной окружения GITHUB_TOKEN."
	elif command -v gh &>/dev/null && gh auth status &>/dev/null; then
		token=$(gh auth token)
		echo "   - ✅ Найден через GitHub CLI (gh)."
	else
		error "Не удалось найти токен. Пожалуйста, войдите в GitHub CLI ('gh auth login') или установите GITHUB_TOKEN."
	fi

	echo "🔍 Определение репозитория..."
	local repo=$(git remote get-url origin | sed -n 's/.*github.com[:\/]\([^.]*\)\.git/\1/p')
	[[ -z "$repo" ]] && error "Не удалось определить репозиторий из 'git remote get-url origin'."
	echo "   - ✅ Репозиторий: ${repo}"

	echo "🔍 Определение диапазона тегов..."
	local target_tag
	if [[ -n "${target_tag_arg}" ]]; then
		[[ "${target_tag_arg}" != "v"* ]] && target_tag_arg="v${target_tag_arg}"
		if ! git rev-parse -q --verify "refs/tags/${target_tag_arg}" &>/dev/null; then
			error "Тег '${target_tag_arg}' не найден в локальном репозитории."
		fi
		target_tag="${target_tag_arg}"
		echo "   - ℹ️ Используется тег из аргумента: ${target_tag}"
	else
		target_tag=$(git describe --tags --abbrev=0)
		echo "   - ℹ️ Аргумент не передан, используется последний тег: ${target_tag}"
	fi

	local previous_tag=$(git describe --tags --abbrev=0 "${target_tag}^" 2>/dev/null || git rev-list --max-parents=0 HEAD | head -n 1)
	echo "   - ✅ Диапазон: от ${previous_tag} до ${target_tag}"

	echo "🔍 Получение коммитов через API..."
	local response_body=$(curl -s \
		-H "Accept: application/vnd.github.v3+json" \
		-H "Authorization: Bearer ${token}" \
		"https://api.github.com/repos/${repo}/compare/${previous_tag}...${target_tag}"
	)

	if echo "${response_body}" | jq -e '.message' > /dev/null; then
		error "API GitHub вернул ошибку: $(echo "${response_body}" | jq -r '.message')"
	fi

	local all_commits=$(echo "${response_body}" | jq -r \
		'.commits[] | "* " + (.commit.message | split("\n")[0]) + " ([" + .author.login + "](https://github.com/" + .author.login + "))"'
	)

	if [[ -z "${all_commits}" ]]; then
		echo "⚪️ Не найдено коммитов для обработки."
		exit 0
	fi
	echo "   - ✅ Коммиты получены."

	echo "🔍 Удаление дубликатов..."
	local commits=$(echo "${all_commits}" | awk '!seen[$0]++')
	echo "   - ✅ Дубликаты удалены."

	echo "🔍 Генерация списка изменений..."
	local changelog_content=""
	local section_content
	section_content=$(get_commits "^\* feat" "" "${commits}") && changelog_content+="### 🚀 Новые возможности\n${section_content}\n\n"
	section_content=$(get_commits "^\* fix" "fix\(ci\)" "${commits}") && changelog_content+="### 🐛 Исправления\n${section_content}\n\n"
	section_content=$(get_commits "^\* docs" "" "${commits}") && changelog_content+="### 📖 Документация\n${section_content}\n\n"
	section_content=$(get_commits "^\* ci|fix\(ci\)|chore\(ci\)|chore\(release\)" "" "${commits}") && changelog_content+="### ⚙️ CI/CD\n${section_content}\n\n"
	section_content=$(get_commits "^\* chore" "chore\(ci\)|chore\(release\)" "${commits}") && changelog_content+="### 🔧 Прочее\n${section_content}\n\n"

	local changelog_link
	if [[ "${previous_tag}" == v* ]]; then
		changelog_link="https://github.com/${repo}/compare/${previous_tag}...${target_tag}"
	else
		changelog_link="https://github.com/${repo}/commits/${target_tag}"
	fi
	changelog_content+="**Full Changelog**: ${changelog_link}"
	echo "   - ✅ Список изменений сгенерирован."

	if [[ -n "${output_file}" ]]; then
		echo -e "${changelog_content}" > "${output_file}"
		echo "   - ✅ Список изменений сохранен в файл: ${output_file}"
	else
		echo && echo -e "${changelog_content}"
	fi
}

main "$@"
