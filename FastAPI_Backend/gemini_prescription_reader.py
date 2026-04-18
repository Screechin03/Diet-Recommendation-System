import base64
import json
import os
from functools import lru_cache
from typing import Any, Dict, Optional

import requests
from requests import Response


IMG_SIZE = 32
CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
MIN_CONTOUR_W = 5
MIN_CONTOUR_H = 15
MAX_CONTOUR_W = 150
MAX_CONTOUR_H = 120


def _get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value


def gemini_enabled() -> bool:
    return bool(_get_env("GEMINI_API_KEY"))


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.lower().startswith("```json"):
        t = t[7:]
    if t.startswith("```"):
        t = t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()


def _call_gemini_parts(parts: list[dict[str, Any]], *, timeout_s: int = 45) -> Optional[str]:
    api_key = _get_env("GEMINI_API_KEY")
    if not api_key:
        return None

    model = (
        _get_env("GEMINI_PRESCRIPTION_MODEL")
        or _get_env("GEMINI_MODEL")
        or "gemini-1.5-flash"
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
        },
    }

    try:
        res: Response = requests.post(url, json=body, timeout=timeout_s)
    except requests.exceptions.RequestException:
        return None
    if res.status_code >= 400:
        return None

    try:
        data = res.json()
    except ValueError:
        return None

    candidate_parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "\n".join([p.get("text", "") for p in candidate_parts if p.get("text")])
    return text.strip() if text else None


def _inline_data_part(file_bytes: bytes, mime_type: str) -> dict[str, Any]:
    encoded = base64.b64encode(file_bytes).decode("utf-8")
    return {"inlineData": {"mimeType": mime_type, "data": encoded}}


def _extract_outer_json_object(text: str) -> Optional[str]:
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_str = False
    escaped = False
    for idx in range(start, len(text)):
        ch = text[idx]

        if escaped:
            escaped = False
            continue

        if ch == "\\":
            escaped = True
            continue

        if ch == '"':
            in_str = not in_str
            continue

        if in_str:
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:idx + 1]

    return None


def _parse_json_object_best_effort(text: str) -> Optional[Dict[str, Any]]:
    cleaned = _strip_code_fences(text)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except (ValueError, json.JSONDecodeError):
        pass

    json_slice = _extract_outer_json_object(cleaned)
    if json_slice:
        try:
            parsed = json.loads(json_slice)
            if isinstance(parsed, dict):
                return parsed
        except (ValueError, json.JSONDecodeError):
            pass

    return None


def _find_ocr_model_path() -> Optional[str]:
    env_path = _get_env("OCR_MODEL_PATH")
    candidates = [
        env_path,
        os.path.join(os.path.dirname(__file__), "..", "h_recog", "ocr_model.h5"),
        os.path.join(os.getcwd(), "h_recog", "ocr_model.h5"),
        "/app/h_recog/ocr_model.h5",
    ]

    for path in candidates:
        if path and os.path.exists(path):
            return os.path.abspath(path)
    return None


@lru_cache(maxsize=1)
def _get_ocr_infer_model(model_path: str):
    try:
        import h5py
        import tensorflow as tf
    except Exception:
        return None

    try:
        keras_model = tf.keras.models.load_model(model_path)
    except TypeError as exc:
        if "quantization_config" not in str(exc):
            return None

        with h5py.File(model_path, "r") as h5_file:
            model_config = h5_file.attrs.get("model_config")
            if model_config is None:
                return None
            if isinstance(model_config, (bytes, bytearray)):
                model_config = model_config.decode("utf-8")

        def strip_key(obj, key_to_remove: str):
            if isinstance(obj, dict):
                return {
                    k: strip_key(v, key_to_remove)
                    for k, v in obj.items()
                    if k != key_to_remove
                }
            if isinstance(obj, list):
                return [strip_key(v, key_to_remove) for v in obj]
            return obj

        cleaned_config = strip_key(json.loads(model_config), "quantization_config")
        keras_model = tf.keras.models.Model.from_config(cleaned_config["config"])
        keras_model.load_weights(model_path)
    except Exception:
        return None

    def infer(roi_input):
        return keras_model.predict(roi_input, verbose=0)

    return infer


def _preprocess_roi(roi, cv2, np):
    thresh = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    t_h, t_w = thresh.shape

    if t_w > t_h:
        new_w = IMG_SIZE
        new_h = max(1, int(round((t_h / float(t_w)) * IMG_SIZE)))
    else:
        new_h = IMG_SIZE
        new_w = max(1, int(round((t_w / float(t_h)) * IMG_SIZE)))

    interp = cv2.INTER_AREA if (new_w < t_w or new_h < t_h) else cv2.INTER_LINEAR
    resized = cv2.resize(thresh, (new_w, new_h), interpolation=interp)

    d_x = max(0, IMG_SIZE - new_w)
    d_y = max(0, IMG_SIZE - new_h)
    left = d_x // 2
    right = d_x - left
    top = d_y // 2
    bottom = d_y - top

    padded = cv2.copyMakeBorder(
        resized,
        top=top,
        bottom=bottom,
        left=left,
        right=right,
        borderType=cv2.BORDER_CONSTANT,
        value=(0, 0, 0),
    )
    padded = cv2.resize(padded, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    padded = padded.astype("float32") / 255.0
    return np.expand_dims(padded, axis=-1)


def _sort_contours(contours, cv2, method: str = "left-to-right"):
    reverse = method in ("right-to-left", "bottom-to-top")
    axis = 1 if method in ("top-to-bottom", "bottom-to-top") else 0
    boxes = [cv2.boundingRect(c) for c in contours]
    contours, boxes = zip(
        *sorted(zip(contours, boxes), key=lambda b: b[1][axis], reverse=reverse)
    )
    return contours, boxes


def _decode_pdf_first_page_to_bgr(file_bytes: bytes):
    # Optional dependency: if PyMuPDF is unavailable, OCR assistance falls back silently.
    try:
        import fitz  # type: ignore
        import numpy as np
    except Exception:
        return None

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        if len(doc) == 0:
            return None
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:
            rgb = rgb[:, :, :3]
        return rgb[:, :, ::-1]  # RGB -> BGR
    except Exception:
        return None


def _run_ocr_assist(file_bytes: bytes, mime_type: str) -> Optional[Dict[str, Any]]:
    model_path = _find_ocr_model_path()
    if not model_path:
        return None

    infer = _get_ocr_infer_model(model_path)
    if infer is None:
        return None

    try:
        import cv2
        import numpy as np
    except Exception:
        return None

    image_bgr = None
    if mime_type.startswith("image/"):
        decoded = cv2.imdecode(np.frombuffer(file_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        image_bgr = decoded
    elif mime_type == "application/pdf":
        image_bgr = _decode_pdf_first_page_to_bgr(file_bytes)

    if image_bgr is None:
        return None

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 30, 150)
    contours, _ = cv2.findContours(edged.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    _, boxes_sorted = _sort_contours(contours, cv2, method="left-to-right")

    boxes = []
    roi_batch = []
    img_h, img_w = gray.shape[:2]
    for (x, y, w, h) in boxes_sorted:
        if (
            w < MIN_CONTOUR_W
            or h < MIN_CONTOUR_H
            or w > MAX_CONTOUR_W
            or h > MAX_CONTOUR_H
        ):
            continue

        x1 = max(0, x)
        y1 = max(0, y)
        x2 = min(img_w, x + w)
        y2 = min(img_h, y + h)
        roi = gray[y1:y2, x1:x2]
        if roi.size == 0:
            continue

        boxes.append((x, y, w, h))
        roi_batch.append(_preprocess_roi(roi, cv2, np))

    if not roi_batch:
        return None

    predictions = infer(np.array(roi_batch, dtype="float32"))

    annotated = image_bgr.copy()
    chars: list[str] = []
    confidences: list[float] = []
    for pred, (x, y, w, h) in zip(predictions, boxes):
        idx = int(np.argmax(pred))
        label = CHARS[idx] if idx < len(CHARS) else "?"
        confidence = float(pred[idx]) if idx < len(pred) else 0.0

        chars.append(label)
        confidences.append(confidence)

        cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(
            annotated,
            f"{label} ({confidence * 100:.1f}%)",
            (x, max(0, y - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 255, 0),
            1,
        )

    ok, encoded = cv2.imencode(".png", annotated)
    if not ok:
        return None

    avg_conf = float(sum(confidences) / len(confidences)) if confidences else 0.0
    return {
        "ocr_text": "".join(chars),
        "avg_confidence": avg_conf,
        "annotated_image_png": encoded.tobytes(),
        "source": "ocr_model",
    }


def extract_prescription_structured(
    *,
    file_bytes: bytes,
    mime_type: str,
    filename: str,
) -> Optional[Dict[str, Any]]:
    """Extract a structured report from a prescription (PDF/photo).

    Returns a dict or None if Gemini is not configured/unavailable.

    Notes:
    - This is best-effort extraction; it may be incomplete.
    - The output is not medical advice.
    """

    if not gemini_enabled():
        return None

    ocr_assist = _run_ocr_assist(file_bytes=file_bytes, mime_type=mime_type)

    ocr_assist_prompt = ""
    if ocr_assist:
        ocr_assist_prompt = (
            "\nOCR_ASSIST (from local handwriting OCR model):\n"
            f"- source: {ocr_assist['source']}\n"
            f"- transcript: {ocr_assist['ocr_text'][:1200]}\n"
            f"- avg_confidence: {ocr_assist['avg_confidence']:.4f}\n"
            "Use this OCR transcript and the attached annotated OCR image as supporting context "
            "when handwriting is unclear in the original document. Prioritize the source document "
            "for final values and report any conflict in uncertainties.\n"
        )

    prompt = (
        "You are a careful medical document transcription assistant. "
        "The user uploaded a prescription (may be handwritten) as PDF or image.\n"
        "TASK: Extract the readable information and return a structured JSON report.\n\n"
        "STRICT RULES:\n"
        "- Do NOT guess missing values. If unclear, set the field to null and add an item to uncertainties.\n"
        "- Do NOT provide diagnosis or treatment advice.\n"
        "- Keep units and dosages exactly as written.\n"
        "- Return JSON ONLY (no markdown, no explanations).\n\n"
        "- Keep response concise. Avoid long prose in list items.\n\n"
        "OUTPUT JSON SCHEMA (keys must exist):\n"
        "{\n"
        "  \"patient\": {\"name\": string|null, \"age\": string|null, \"sex\": string|null},\n"
        "  \"document\": {\"type\": \"prescription\"|\"lab_report\"|\"discharge_summary\"|null, \"date\": string|null, \"provider\": string|null},\n"
        "  \"diagnoses\": [string],\n"
        "  \"medications\": [\n"
        "    {\"name\": string|null, \"dose\": string|null, \"frequency\": string|null, \"duration\": string|null, \"notes\": string|null}\n"
        "  ],\n"
        "  \"tests\": [\n"
        "    {\"name\": string|null, \"value\": string|null, \"unit\": string|null, \"reference_range\": string|null, \"flag\": string|null}\n"
        "  ],\n"
        "  \"instructions\": [string],\n"
        "  \"dietary_notes\": [string],\n"
        "  \"follow_up\": [string],\n"
        "  \"allergies\": [string],\n"
        "  \"uncertainties\": [string]\n"
        "}\n\n"
        f"FILENAME: {filename}\n"
        f"MIME_TYPE: {mime_type}\n"
        + ocr_assist_prompt
    )

    parts = [{"text": prompt}, _inline_data_part(file_bytes, mime_type)]
    if ocr_assist:
        parts.append(_inline_data_part(ocr_assist["annotated_image_png"], "image/png"))

    text = _call_gemini_parts(parts)

    if not text:
        return None

    parsed = _parse_json_object_best_effort(text)
    if parsed is not None:
        return parsed

    cleaned = _strip_code_fences(text)
    # Fallback: return best-effort text.
    return {
        "patient": {"name": None, "age": None, "sex": None},
        "document": {"type": None, "date": None, "provider": None},
        "diagnoses": [],
        "medications": [],
        "tests": [],
        "instructions": [],
        "dietary_notes": [],
        "follow_up": [],
        "allergies": [],
        "uncertainties": ["Could not parse JSON. Raw text attached.", cleaned[:3000]],
    }


def generate_diet_plan_from_extraction(
    *,
    extracted: Dict[str, Any],
    dietary_preferences: list[str],
    allergies: list[str],
    goals: list[str],
) -> Optional[Dict[str, Any]]:
    """Generate general diet guidance based on extracted prescription content.

    This intentionally stays high-level and conservative.
    """

    if not gemini_enabled():
        return None

    payload = {
        "extracted": extracted,
        "user_preferences": {
            "dietary_preferences": dietary_preferences,
            "allergies": allergies,
            "goals": goals,
        },
    }

    prompt = (
        "You are a careful diet-planning assistant. You are given extracted prescription data.\n"
        "RULES:\n"
        "- Do NOT diagnose and do NOT change/interpret dosages.\n"
        "- Do NOT contradict the document; if unsure, say it's uncertain.\n"
        "- Provide general nutrition guidance and meal ideas only.\n"
        "- Keep each list item concise (one sentence).\n"
        "- Include: 'This is not medical advice. Follow your clinician\'s instructions.'\n"
        "- Return JSON ONLY.\n\n"
        "OUTPUT JSON KEYS (must exist):\n"
        "{\n"
        "  \"title\": string,\n"
        "  \"summary\": string,\n"
        "  \"do\": [string],\n"
        "  \"avoid\": [string],\n"
        "  \"meal_ideas\": [string],\n"
        "  \"questions_for_doctor\": [string],\n"
        "  \"safety_notes\": [string]\n"
        "}\n\n"
        "INPUT JSON:\n"
        + json.dumps(payload)
    )

    text = _call_gemini_parts([{"text": prompt}])
    if not text:
        return None

    parsed = _parse_json_object_best_effort(text)
    if parsed is not None:
        return parsed

    cleaned = _strip_code_fences(text)
    return {
        "title": "Diet Plan",
        "summary": cleaned,
        "do": [],
        "avoid": [],
        "meal_ideas": [],
        "questions_for_doctor": [],
        "safety_notes": [],
    }
