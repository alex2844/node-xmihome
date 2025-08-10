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

function deduplicate_and_format_commits() {
	local all_commits="$1"
	local formatted_commits=""
	declare -A seen_hashes
	declare -A seen_messages
	declare -A github_authors

	while IFS='|' read -r hash message author; do
		[[ -z "${hash}" ]] && continue
		if [[ "${author}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
			github_authors["${hash}"]="([${author}](https://github.com/${author}))"
		fi
	done <<< "${all_commits}"

	while IFS='|' read -r hash message author; do
		[[ -z "${hash}" ]] && continue
		if [[ -n "${seen_hashes[${hash}]:-}" ]] || [[ -n "${seen_messages[${message}]:-}" ]]; then
			continue
		fi
		seen_hashes["${hash}"]=1
		seen_messages["${message}"]=1

		local author_info
		if [[ -n "${github_authors[${hash}]:-}" ]]; then
			author_info="${github_authors[${hash}]}"
		else
			author_info="(${author})"
		fi

		formatted_commits+="* ${message} ${author_info}"$'\n'
	done <<< "${all_commits}"

	echo "${formatted_commits}"
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

function get_github_commits() {
	local repo="$1"
	local token="$2"
	local from_ref="$3"
	local to_ref="$4"

	local response_body=$(curl -s \
		-H "Accept: application/vnd.github.v3+json" \
		-H "Authorization: Bearer ${token}" \
		"https://api.github.com/repos/${repo}/compare/${from_ref}...${to_ref}"
	)

	if echo "${response_body}" | jq -e '.message' > /dev/null; then
		local error_msg=$(echo "${response_body}" | jq -r '.message')
		if [[ "${error_msg}" == "Not Found" ]]; then
			echo "⚠️  Предупреждение: Не удалось получить данные через GitHub API. Возможно, один из тегов не существует в удаленном репозитории." >&2
			return 1
		else
			error "API GitHub вернул ошибку: ${error_msg}"
		fi
	fi

	echo "${response_body}" | jq -r '.commits[] | .sha[0:7] + "|" + (.commit.message | split("\n")[0]) + "|" + .author.login'
}

function get_local_commits() {
	local from_ref="$1"
	local to_ref="$2"
	git log --no-merges --pretty=format:"%h|%s|%an" "${from_ref}".."${to_ref}" 2>/dev/null || true
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
		echo "   - ⚠️  Токен GitHub не найден. Будут использоваться только локальные коммиты."
	fi

	echo "🔍 Определение репозитория..."
	local repo
	if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
		repo="${GITHUB_REPOSITORY}"
		echo "   - ✅ Репозиторий найден из переменной окружения GITHUB_REPOSITORY: ${repo}"
	else
		repo=$(git remote get-url origin | sed -n 's/.*github.com[:\/]\([^.]*\)\.git/\1/p')
		if [[ -z "$repo" ]]; then
			echo "   - ⚠️  Не удалось определить GitHub репозиторий. Будут использоваться только локальные коммиты."
		fi
		echo "   - ✅ Репозиторий определен из git remote: ${repo}"
	fi

	echo "🔍 Определение диапазона..."
	local target_tag
	local previous_tag
	if [[ -n "${target_tag_arg}" ]]; then
		[[ "${target_tag_arg}" != "v"* ]] && target_tag_arg="v${target_tag_arg}"
		if ! git rev-parse -q --verify "refs/tags/${target_tag_arg}" &>/dev/null; then
			error "Тег '${target_tag_arg}' не найден в локальном репозитории."
		fi
		target_tag="${target_tag_arg}"
		previous_tag=$(git describe --tags --abbrev=0 "${target_tag}^" 2>/dev/null || git rev-list --max-parents=0 HEAD | head -n 1)
		echo "   - ℹ️  Используется тег из аргумента: ${target_tag}"
		echo "   - ✅ Диапазон: от ${previous_tag} до ${target_tag}"
	else
		if ! git describe --tags --abbrev=0 &>/dev/null; then
			echo "   - ℹ️  Теги не найдены, используются все коммиты от начала репозитория"
			previous_tag=$(git rev-list --max-parents=0 HEAD | head -n 1)
			target_tag="HEAD"
		else
			local latest_tag=$(git describe --tags --abbrev=0)
			local commits_after_tag=$(git rev-list "${latest_tag}..HEAD" --count 2>/dev/null || echo "0")
			if [[ "${commits_after_tag}" -gt 0 ]]; then
				echo "   - ℹ️  Найдено ${commits_after_tag} коммитов после последнего тега ${latest_tag}"
				echo "   - ℹ️  Генерируется changelog для нереализованных изменений"
				previous_tag="${latest_tag}"
				target_tag="HEAD"
				echo "   - ✅ Диапазон: от ${previous_tag} до HEAD"
			else
				echo "   - ℹ️  Коммитов после последнего тега не найдено, используется последний тег: ${latest_tag}"
				target_tag="${latest_tag}"
				previous_tag=$(git describe --tags --abbrev=0 "${target_tag}^" 2>/dev/null || git rev-list --max-parents=0 HEAD | head -n 1)
				echo "   - ✅ Диапазон: от ${previous_tag} до ${target_tag}"
			fi
		fi
	fi

	echo "🔍 Получение коммитов..."
	local all_commits=""
	echo "   - Получение локальных коммитов..."
	all_commits=$(get_local_commits "${previous_tag}" "${target_tag}")
	if [[ -n "${token}" && -n "${repo}" ]]; then
		echo "   - Попытка дополнения данными из GitHub API..."
		local github_commits=""
		if github_commits=$(get_github_commits "${repo}" "${token}" "${previous_tag}" "${target_tag}"); then
			echo "   - ✅ Данные из GitHub API получены, объединяем с локальными..."
			all_commits=$(printf "%s\n%s" "${all_commits}" "${github_commits}")
		else
			echo "   - ⚠️  Не удалось получить данные из API, используются только локальные коммиты"
		fi
	fi
	echo "   - ✅ Коммиты обработаны."

	if [[ -z "${all_commits}" ]]; then
		echo "⚪️ Не найдено коммитов для обработки."
		exit 0
	fi

	echo "🔍 Удаление дубликатов..."
	local commits=$(deduplicate_and_format_commits "${all_commits}")
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
