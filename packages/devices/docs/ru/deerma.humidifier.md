# Xiaomi Smart Humidifier 2 (deerma.humidifier.jsq2w)

Класс для управления умным увлажнителем Xiaomi Smart Humidifier 2.

## Модели

- `deerma.humidifier.jsq2w`

## Свойства (MIoT)

| Имя | Описание | Доступ | siid / piid | Формат |
|---|---|---|---|---|
| `on` | Включение/выключение увлажнителя. | `read`, `write`, `notify` | `2` / `1` | `bool` |
| `current_temperature` | Текущая температура. | `read`, `notify` | `3` / `7` | `float` |
| `current_humidity` | Текущая влажность. | `read`, `notify` | `3` / `1` | `uint8` |
| `target_humidity` | Целевая влажность. | `read`, `write`, `notify` | `2` / `6` | `uint8` |
| `fault` | Код ошибки. | `read`, `notify` | `2` / `2` | `uint8` |
| `fan_level` | Уровень вентилятора. | `read`, `write`, `notify` | `2` / `5` | `uint8` |
| `mode` | Режим работы. | `read`, `write`, `notify` | `2` / `8` | `uint8` |
| `status` | Статус устройства. | `read`, `notify` | `2` / `7` | `uint8` |
