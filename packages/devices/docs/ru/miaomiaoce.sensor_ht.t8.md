# Temperature Humidity Sensor (miaomiaoce.sensor_ht.t8)

Класс для управления датчиком температуры и влажности Miaomiaoce Sensor HT.T8.

## Модели

- `miaomiaoce.sensor_ht.t8`

## Псевдонимы

- `LYWSD02MMC`

## Свойства (Bluetooth)

| Имя | Описание | Доступ | Сервис / Характеристика (короткий ID) |
|---|---|---|---|
| `battery` | Уровень заряда батареи (в процентах). | `read` | `001b` / `0036` |
| `time` | Время и временная зона устройства. Позволяет читать и устанавливать текущее время (timestamp) и смещение временной зоны. | `read`, `write` | `001b` / `001c` |
| `status` | Текущие показания датчика. Возвращает объект `{temp: number, hum: number}`. | `read`, `notify` | `001b` / `002f` |

## Карта UUID

### Сервисы

| UUID | Короткий ID |
|---|---|
| `ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6` | `001b` |

### Характеристики

| UUID | Короткий ID |
|---|---|
| `ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6` | `0036` |
| `ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6` | `001c` |
| `ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6` | `002f` |
