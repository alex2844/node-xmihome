# xmihome-devices

[RU] | [[EN]](../../README.md)

Этот пакет содержит определения и классы для конкретных моделей устройств
Xiaomi Mi Home, позволяя управлять ими через основную библиотеку `xmihome`.

## Поддерживаемые устройства

Ниже приведен список поддерживаемых устройств, сгруппированных по типу подключения.

### MIoT устройства

Эти устройства управляются по протоколу MIoT (Xiaomi IoT),
который обычно использует облачное или локальное сетевое подключение.

| Название устройства | Модели | Документация |
| --- | --- | --- |
| Xiaomi Smart Humidifier 2 | `deerma.humidifier.jsq2w` | [Смотреть](./deerma.humidifier.md) |
| ROIDMI EVE | `roidmi.vacuum.v60` | [Смотреть](./roidmi.vacuum.md) |

### Bluetooth устройства

Эти устройства управляются напрямую через Bluetooth Low Energy (BLE).

| Название устройства | Модели | Документация |
| --- | --- | --- |
| Temperature Humidity Sensor | `miaomiaoce.sensor_ht.t8` | [Смотреть](./miaomiaoce.sensor_ht.md) |
| Умные весы Xiaomi Body Composition Scale | `xiaomi.scales.ms115` | [Смотреть](./xiaomi.scales.md) |
| Mi Smart Kettle | `yunmi.kettle.v2` | [Смотреть](./yunmi.kettle.md) |
