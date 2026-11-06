# Handwriting OCR

Reads **block-letter handwriting** (separate capitals A–Z and digits 0–9) from a photo or the first page of a PDF.
The API exposes it at `POST /ocr/handwriting`, and `POST /prescription_report` runs it automatically.

## Origin

The character model was trained in the **h_recog** project: https://github.com/TakeASwing-420/h_recog
(commit `0763d4b`, `ocr_model.h5`, sha256 `b60640a2…3be0`). It is a ResNet trained on the Kaggle A–Z handwritten
dataset plus MNIST digits.

It used to be referenced as a git submodule, but the submodule was never actually committed, so the backend never
found the model. It also pulled in a 94 MB training dataset that the API doesn't need. Only the trained model is
vendored here, converted to ONNX:

| | `ocr_model.h5` (original) | `handwriting_ocr.onnx` (here) |
|---|---|---|
| Runtime needed | TensorFlow (>1 GB, Keras-version sensitive) | onnxruntime (~15 MB) |
| Size | 5.0 MB | 2.2 MB |
| Predictions | — | identical (max abs diff 1.5e-6, same argmax on all test inputs) |

## Improvements over `ocr_handwriting.py`

- **Line order:** characters are grouped into lines first. The original sorted the whole page by x only, so
  `HELLO / WORLD` came out as `HWE0LR0LD` (and `UMBC / 21250` as `U2M1B2C50`).
- **Size filters scale with the image:** fixed pixel limits dropped every character on large phone photos.
- **Character cleanup:** fragments (the dot of an i, broken strokes) are merged, specks and nested boxes dropped.
- **Spaces:** inserted at word gaps.
- **Look-alikes** (0/O, 1/I, 5/S, 8/B…) are resolved from the rest of the word.
- **Honest output:** a confidence-based verdict is returned. The model only knows isolated block capitals, so it
  cannot read cursive prescriptions; those come back as `unreadable` with no text, instead of random characters.
  Only `clear` reads are passed to Gemini as extra context.

Verdict thresholds (average character confidence): `clear` ≥ 0.85, `partial` ≥ 0.75, otherwise `unreadable`.
On the sample images, block letters score 0.78–0.92 and the cursive prescriptions in `Data/images` score ≤ 0.74.

## Updating the model

When h_recog retrains `ocr_model.h5`, re-export it:

```bash
pip install "tensorflow==2.19.*" tf2onnx onnxruntime h5py
python ocr/tools/export_onnx.py /path/to/h_recog/ocr_model.h5 ocr/handwriting_ocr.onnx
pytest tests -q
```

The class order must stay `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ` (digits, then letters offset by 10, as in
`train_ocr_model.py`).
