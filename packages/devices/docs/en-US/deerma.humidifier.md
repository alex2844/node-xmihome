# Xiaomi Smart Humidifier 2 (deerma.humidifier.jsq2w)

Class for managing the Xiaomi Smart Humidifier 2.

## Models

- `deerma.humidifier.jsq2w`

## Properties (MIoT)

| Name | Description | Access | siid / piid | Format |
|---|---|---|---|---|
| `on` | Turn the humidifier on/off. | `read`, `write`, `notify` | `2` / `1` | `bool` |
| `current_temperature` | Current temperature. | `read`, `notify` | `3` / `7` | `float` |
| `current_humidity` | Current humidity. | `read`, `notify` | `3` / `1` | `uint8` |
| `target_humidity` | Target humidity. | `read`, `write`, `notify` | `2` / `6` | `uint8` |
| `fault` | Error code. | `read`, `notify` | `2` / `2` | `uint8` |
| `fan_level` | Fan level. | `read`, `write`, `notify` | `2` / `5` | `uint8` |
| `mode` | Operating mode. | `read`, `write`, `notify` | `2` / `8` | `uint8` |
| `status` | Device status. | `read`, `notify` | `2` / `7` | `uint8` |
