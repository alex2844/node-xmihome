# Temperature Humidity Sensor (miaomiaoce.sensor_ht.t8)

Class for managing the Miaomiaoce Sensor HT.T8 temperature and humidity sensor.

## Models

- `miaomiaoce.sensor_ht.t8`

## Aliases

- `LYWSD02MMC`

## Properties (Bluetooth)

| Name | Description | Access | Service / Characteristic (Short ID) |
|---|---|---|---|
| `battery` | Battery level (in percent). | `read` | `001b` / `0036` |
| `time` | Device time and timezone. Allows reading and setting the current time (timestamp) and timezone offset. | `read`, `write` | `001b` / `001c` |
| `status` | Current sensor readings. Returns an object `{temp: number, hum: number}`. | `read`, `notify` | `001b` / `002f` |

## UUID Map

### Services

| UUID | Short ID |
|---|---|
| `ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6` | `001b` |

### Characteristics

| UUID | Short ID |
|---|---|
| `ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6` | `0036` |
| `ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6` | `001c` |
| `ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6` | `002f` |
