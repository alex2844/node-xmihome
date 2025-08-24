# Xiaomi Body Composition Scale

Class for managing the Xiaomi Body Composition Scale.

## Models

- `xiaomi.scales.ms115`

## Aliases

- `MIBFS`

## Configuration

To calculate advanced body metrics, the device requires user data. This data
should be provided in the device configuration object under the `user` key.

| Key        | Type                 | Description                                  |
| ---------- | -------------------- | -------------------------------------------- |
| `height`   | `number`             | User height in cm.                           |
| `birthday` | `date`               | User's date of birth (e.g., 'YYYY-MM-DD').   |
| `gender`   | `'male' \| 'female'` | User's gender.                               |

## Properties (Bluetooth)

| Name          | Description                                                      | Access           | Service / Characteristic (Short ID) |
| ------------- | ---------------------------------------------------------------- | ---------------- | ----------------------------------- |
| `measurement` | Characteristic for receiving measurement data. Returns intermediate | `read`, `notify` | `0017` / `001c`                     |
|               | (weight only) and final (full report with BMI, body fat, muscle  |                  |                                     |
|               | mass, water, bone mass, protein, visceral fat, basal metabolism, |                  |                                     |
|               | body age, ideal weight, body type, and body score) data.         |                  |                                     |

## Constants

The device uses the following constant values, which can be seen in the
output of the `measurement` property when full metrics are calculated.

### Body Type (`bodyType`)

| Value               | Description         |
| ------------------- | ------------------- |
| `obese`             | Obese               |
| `overweight`        | Overweight          |
| `thick-set`         | Thick-set           |
| `lack-exerscise`    | Lack of exercise    |
| `balanced`          | Balanced            |
| `balanced-muscular` | Balanced-muscular   |
| `skinny`            | Skinny              |
| `balanced-skinny`   | Balanced-skinny     |
| `skinny-muscular`   | Skinny-muscular     |

### BMI Status (`bmi.status`)

| Value            | Description    |
| ---------------- | -------------- |
| `Underweight`    | Underweight    |
| `Normal`         | Normal         |
| `Overweight`     | Overweight     |
| `Obese`          | Obese          |
| `Morbidly Obese` | Morbidly Obese |

### Body Fat Status (`bodyFat.status`)

| Value       | Description |
| ----------- | ----------- |
| `Very Low`  | Very Low    |
| `Low`       | Low         |
| `Normal`    | Normal      |
| `High`      | High        |
| `Very High` | Very High   |

### Muscle Mass Status (`muscleMass.status`)

| Value          | Description  |
| -------------- | ------------ |
| `Insufficient` | Insufficient |
| `Normal`       | Normal       |
| `Good`         | Good         |

### Water Status (`water.status`)

| Value          | Description  |
| -------------- | ------------ |
| `Insufficient` | Insufficient |
| `Normal`       | Normal       |
| `Good`         | Good         |

### Bone Mass Status (`boneMass.status`)

| Value          | Description  |
| -------------- | ------------ |
| `Insufficient` | Insufficient |
| `Normal`       | Normal       |
| `Good`         | Good         |

### Protein Status (`protein.status`)

| Value          | Description  |
| -------------- | ------------ |
| `Insufficient` | Insufficient |
| `Normal`       | Normal       |
| `Good`         | Good         |

### Visceral Fat Status (`visceralFat.status`)

| Value       | Description |
| ----------- | ----------- |
| `Normal`    | Normal      |
| `High`      | High        |
| `Very High` | Very High   |

### Basal Metabolism Status (`basalMetabolism.status`)

| Value          | Description  |
| -------------- | ------------ |
| `Insufficient` | Insufficient |
| `Normal`       | Normal       |

## UUID Map

### Services

| UUID                                   | Short ID |
| -------------------------------------- | -------- |
| `0000181b-0000-1000-8000-00805f9b34fb` | `0017`   |

### Characteristics

| UUID                                   | Short ID |
| -------------------------------------- | -------- |
| `00002a9c-0000-1000-8000-00805f9b34fb` | `001c`   |
