# node-xmihome

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[RU] | [[EN]](../README.md)

Это монорепозиторий для `node-xmihome` — набора инструментов для управления
устройствами Xiaomi Mi Home через Node.js. Проект предоставляет как основную
библиотеку для разработчиков, так и готовую интеграцию для Node-RED.

## Структура репозитория

Этот репозиторий содержит несколько пакетов, находящихся в директории `packages/`:

| Пакет | NPM | Описание |
| --- | --- | --- |
| [`xmihome`](../../packages/node/) | [![npm](https://img.shields.io/npm/v/xmihome.svg)](https://www.npmjs.com/package/xmihome) | Основная библиотека для взаимодействия с устройствами Xiaomi через Cloud, MiIO и Bluetooth. |
| [`node-red-contrib-xmihome`](../../packages/node-red/) | [![npm](https://img.shields.io/npm/v/node-red-contrib-xmihome.svg)](https://www.npmjs.com/package/node-red-contrib-xmihome) | Набор узлов для легкой интеграции `xmihome` в проекты Node-RED. |
| [`xmihome-devices`](../../packages/devices/) | [![npm](https://img.shields.io/npm/v/xmihome-devices.svg)](https://www.npmjs.com/package/xmihome-devices) | Определения и спецификации для конкретных моделей устройств. |
| [`xmihome-web`](../../packages/web/) | (Приватный) | Демонстрационное веб-приложение для управления устройствами через Web Bluetooth. |

## Настройка для разработки

Для работы с этим монорепозиторием вам потребуется установить [Bun](https://bun.sh/),
так как он корректно обрабатывает зависимости воркспейсов в этом проекте.

1. **Клонируйте репозиторий:**

    ```bash
    git clone https://github.com/alex2844/node-xmihome.git
    cd node-xmihome
    ```

2. **Установите зависимости:**
    Эта команда установит зависимости для всех пакетов и создаст необходимые
    символические ссылки между ними.

    ```bash
    bun install
    ```

3. **Сборка пакетов:**
    Если какому-либо пакету требуется шаг сборки (например, `node-red-contrib-xmihome`),
    вы можете собрать все пакеты сразу с помощью команды:

    ```bash
    bun run build
    ```

4. **Проверка типов:**
    Для проверки кода с помощью TypeScript выполните:

    ```bash
    bun run test
    ```
