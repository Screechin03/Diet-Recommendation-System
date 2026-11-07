# MamaCare vitals device: data protocol (v1)

This is the contract between the ESP32 firmware (ECE team) and the MamaCare app (website, phone app and backend).
If the device sends exactly this, the app can display it live, analyse it and produce a PDF report.

## Transport

The same lines are used on every path:

| Path | How | Status |
|---|---|---|
| USB (live) | ESP32 USB serial, **115200 baud, 8N1**, read by the website in Chrome or Edge on a computer (Web Serial API) | Supported |
| SD card (offline) | Write the same lines to a file `SESSION_YYYYMMDD_HHMMSS.jsonl`; the user imports the file on the website or phone app | Supported |
| Wi-Fi / 4G | `POST` the lines to the backend (same parser) | Planned, no app change needed |

iPhones cannot read USB serial devices, and Android needs native code for it, so on phones use the SD-card file.

## Format: one JSON object per line

- UTF-8 text, one JSON object per line, ending in `\n` (`Serial.println(...)` in Arduino).
- Every object has a type field `"t"`.
- **Unknown fields and unknown types are ignored**, and a malformed line is skipped (counted, not fatal).
  So debug prints don't break anything, but keep them to a minimum.
- `ms` = milliseconds since the session started (the ESP32's `millis()` minus the start time). It should only increase.
  Small jitter is tolerated. If `ms` jumps back by more than 5 s (the device rebooted and appended a new session to
  the same SD file), only the latest session is analysed. Better: start a new file for every session.
- Use `null` (or leave the field out) for a value you don't have. **Never send 0 or -999 as a placeholder.**

### 1. `hello`: once, at the start of every session

```json
{"t":"hello","v":1,"device":"mamacare-esp32","fw":"0.1.0","ecg_hz":250,"adc_bits":12}
```

| Field | Meaning |
|---|---|
| `v` | Protocol version, always `1` |
| `device` | Device name or ID |
| `fw` | Firmware version |
| `ecg_hz` | ECG sample rate in Hz (250 recommended; 125–1000 accepted) |
| `adc_bits` | ADC resolution for ECG samples (ESP32 = `12`, so values are 0–4095) |

### 2. `vitals`: once per second, from the MAX30102 (+ temperature sensor)

```json
{"t":"vitals","ms":15000,"hr":82,"spo2":98,"temp_c":36.9,"finger":true}
```

| Field | Unit | Accepted range | Notes |
|---|---|---|---|
| `hr` | beats/min | 30–220 | From the pulse oximeter algorithm. `null` while not valid |
| `spo2` | % | 70–100 | `null` while not valid |
| `temp_c` | °C | 30–43 | **Body** temperature. Leave it out if there is no body-temperature sensor (see note) |
| `finger` | true/false | | `false` when no finger is detected; hr/spo2 are then ignored |

Values outside the accepted range are treated as sensor errors and ignored.

### 3. `ecg`: raw AD8232 samples, in chunks

```json
{"t":"ecg","ms":15000,"lo":false,"s":[2048,2051,2060,2110,2300,2650,2400,2150,2060,2049]}
```

| Field | Meaning |
|---|---|
| `ms` | Time of the **first** sample in this chunk |
| `lo` | Leads-off: `true` if the AD8232 `LO+` or `LO-` pin is high anywhere in this chunk |
| `s` | Raw ADC values, in order, at `ecg_hz`. 25–250 samples per chunk (0.1–1 s) works well |

Send raw readings: no filtering, no averaging. The backend filters the signal itself.

### 4. `end`: optional, when the user stops the session

```json
{"t":"end","ms":120000}
```

## Example session (start)

```
{"t":"hello","v":1,"device":"mamacare-esp32","fw":"0.1.0","ecg_hz":250,"adc_bits":12}
{"t":"ecg","ms":0,"lo":false,"s":[2047,2049,2050,2048,...]}
{"t":"vitals","ms":1000,"hr":null,"spo2":null,"finger":false}
{"t":"ecg","ms":1000,"lo":false,"s":[...]}
{"t":"vitals","ms":2000,"hr":81,"spo2":98,"temp_c":36.8,"finger":true}
```

## Limits

- At least **60 seconds** of data is needed for an analysis; 2–5 minutes at rest is ideal.
- Maximum **30 minutes** per session (keeps uploads under hosting limits).
- At 250 Hz, an ECG chunk every 0.5 s is about 125 numbers per line. USB at 115200 baud handles this comfortably.

## Hardware notes for the ECE team

- **Body temperature:** the MAX30102 has an on-chip temperature sensor, but it measures the chip, not the person.
  For fever detection use a body sensor (for example MAX30205 or DS18B20 against the skin), or leave `temp_c` out.
- **ECG electrodes:** wire the AD8232 `LO+`/`LO-` pins to GPIOs and report them in `lo`, so the app can ignore
  noise while an electrode is loose.
- **ADC:** use one of ADC1's pins for the ECG (ADC2 cannot be used while Wi-Fi is on), and sample on a timer, not with `delay()`,
  so `ecg_hz` is accurate. Gaps or jitter make heart-rate variability wrong.

## Testing without the device

Two ready-made sessions are in [`Docs/sample-sessions/`](sample-sessions/) (normal and irregular heartbeat, 2 minutes each).
The backend includes a simulator that writes more:

```bash
cd FastAPI_Backend
python -m vitals.simulate --scenario normal --seconds 120 > session.jsonl
# scenarios: normal, tachycardia, low_spo2, fever, irregular, leads_off
```

Import `session.jsonl` on the website or phone app to see the full flow. The ECE team can compare their firmware
output line by line with these files.
