"""Handwriting OCR (block letters A-Z and digits 0-9).

Model: ResNet character classifier from github.com/TakeASwing-420/h_recog (commit 0763d4b),
exported to ONNX (`handwriting_ocr.onnx`, identical predictions) so the API needs only
onnxruntime + OpenCV instead of TensorFlow. See ocr/README.md.

Changes vs. the original h_recog script:
- Characters are grouped into LINES before reading left-to-right. The original sorted every
  character on the page by x only, so two lines were interleaved ("HELLO/WORLD" -> "HWEOLRLLOD").
- Size filters scale with the image (fixed pixel limits dropped every character on phone photos).
- Fragments of one character are merged; nested/specks removed; spaces inserted at word gaps.
- Look-alikes (0/O, 1/I, 5/S...) are resolved from the rest of the word.
- A quality verdict is returned. The model reads isolated block capitals; cursive prescriptions
  come out as noise with low confidence, which is reported as "unreadable" instead of fake text.
"""

import base64
import os
import threading
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

MODEL_PATH = os.getenv(
    "HANDWRITING_OCR_MODEL", os.path.join(os.path.dirname(os.path.abspath(__file__)), "handwriting_ocr.onnx")
)
CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"  # class order used in training (digits, then A-Z)
IMG_SIZE = 32
MAX_SIDE = 1600
CLEAR_CONFIDENCE = 0.85
PARTIAL_CONFIDENCE = 0.75
_TO_LETTER = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G"}
_TO_DIGIT = {**{v: k for k, v in _TO_LETTER.items()}, "D": "0", "Q": "0"}

_session = None
_session_lock = threading.Lock()


class OCRUnavailable(RuntimeError):
    pass


class UnreadableImage(ValueError):
    pass


def _cv2():
    try:
        import cv2  # noqa: WPS433

        return cv2
    except ImportError as e:  # pragma: no cover
        raise OCRUnavailable("opencv-python-headless is not installed") from e


def _get_session():
    global _session
    if _session is None:
        with _session_lock:
            if _session is None:
                try:
                    import onnxruntime as ort
                except ImportError as e:  # pragma: no cover
                    raise OCRUnavailable("onnxruntime is not installed") from e
                if not os.path.exists(MODEL_PATH):
                    raise OCRUnavailable(f"OCR model not found at {MODEL_PATH}")
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 2
                _session = ort.InferenceSession(MODEL_PATH, sess_options=opts, providers=["CPUExecutionProvider"])
    return _session


def is_available() -> bool:
    try:
        _get_session()
        _cv2()
        return True
    except OCRUnavailable:
        return False


def _classify(batch: np.ndarray) -> np.ndarray:
    session = _get_session()
    return session.run(None, {session.get_inputs()[0].name: batch})[0]


# ---------------------------------------------------------------------------
# Image decoding
# ---------------------------------------------------------------------------

def decode_to_bgr(file_bytes: bytes, mime_type: str):
    cv2 = _cv2()
    if mime_type == "application/pdf":
        try:
            import pypdfium2 as pdfium
        except ImportError as e:  # pragma: no cover
            raise OCRUnavailable("pypdfium2 is not installed") from e
        try:
            pdf = pdfium.PdfDocument(file_bytes)
            if len(pdf) == 0:
                raise UnreadableImage("The PDF has no pages.")
            arr = pdf[0].render(scale=2).to_numpy()  # BGR or BGRx, no Pillow needed
            return np.ascontiguousarray(arr[:, :, :3]) if arr.ndim == 3 else cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
        except UnreadableImage:
            raise
        except Exception as e:
            raise UnreadableImage("Could not open this PDF.") from e

    # IMREAD_COLOR applies the EXIF orientation, so rotated phone photos are read upright.
    image = cv2.imdecode(np.frombuffer(file_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise UnreadableImage("Could not decode this image. Use a JPG or PNG photo.")
    return image


# ---------------------------------------------------------------------------
# Reading pipeline
# ---------------------------------------------------------------------------

def _preprocess_roi(cv2, roi):
    thresh = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    h, w = thresh.shape
    if w > h:
        nw, nh = IMG_SIZE, max(1, round(h / w * IMG_SIZE))
    else:
        nh, nw = IMG_SIZE, max(1, round(w / h * IMG_SIZE))
    interp = cv2.INTER_AREA if (nw < w or nh < h) else cv2.INTER_LINEAR
    resized = cv2.resize(thresh, (nw, nh), interpolation=interp)
    dx, dy = IMG_SIZE - nw, IMG_SIZE - nh
    padded = cv2.copyMakeBorder(resized, dy // 2, dy - dy // 2, dx // 2, dx - dx // 2, cv2.BORDER_CONSTANT, value=0)
    padded = cv2.resize(padded, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    return (padded.astype("float32") / 255.0)[..., None]


def _overlap(a0, a1, b0, b1):
    return max(0, min(a1, b1) - max(a0, b0))


def _merge_fragments(boxes, med_h):
    """Merge pieces of one character (dot of i/j, broken strokes) stacked vertically."""
    boxes = sorted(boxes)
    changed = True
    while changed:
        changed = False
        out = []
        while boxes:
            x, y, w, h = boxes.pop(0)
            for i, (x2, y2, w2, h2) in enumerate(boxes):
                vgap = max(y2 - (y + h), y - (y2 + h2))
                if _overlap(x, x + w, x2, x2 + w2) >= 0.6 * min(w, w2) and vgap < 0.35 * med_h:
                    nx, ny = min(x, x2), min(y, y2)
                    boxes[i] = (nx, ny, max(x + w, x2 + w2) - nx, max(y + h, y2 + h2) - ny)
                    changed = True
                    break
            else:
                out.append((x, y, w, h))
        boxes = out
    return boxes


def _detect_boxes(cv2, gray) -> List[Tuple[int, int, int, int]]:
    H, W = gray.shape
    edged = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 30, 150)
    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = [cv2.boundingRect(c) for c in contours]
    boxes = [
        b for b in boxes
        if max(8, 0.012 * H) <= b[3] <= 0.3 * H and b[2] <= 0.3 * W and b[2] / max(b[3], 1) <= 3.0
    ]
    if not boxes:
        return []
    boxes = _merge_fragments(boxes, median(b[3] for b in boxes))
    med_h = median(b[3] for b in boxes)
    boxes = [b for b in boxes if 0.45 * med_h <= b[3] <= 2.5 * med_h]
    return [
        b for b in boxes
        if not any(
            o != b and o[0] <= b[0] and o[1] <= b[1] and o[0] + o[2] >= b[0] + b[2] and o[1] + o[3] >= b[1] + b[3]
            for o in boxes
        )
    ]


def _group_lines(boxes):
    """Cluster boxes into text lines top-to-bottom, then sort each line left-to-right."""
    if not boxes:
        return []
    med_h = median(b[3] for b in boxes)
    lines: List[list] = []  # [sum_center_y, count, boxes]
    for b in sorted(boxes, key=lambda b: b[1] + b[3] / 2):
        cy = b[1] + b[3] / 2
        for line in lines:
            if abs(cy - line[0] / line[1]) <= 0.6 * med_h:
                line[0] += cy
                line[1] += 1
                line[2].append(b)
                break
        else:
            lines.append([cy, 1, [b]])
    lines.sort(key=lambda l: l[0] / l[1])
    return [sorted(l[2], key=lambda b: b[0]) for l in lines]


def _fix_word(chars: List[str]) -> List[str]:
    letters = sum(c.isalpha() for c in chars)
    digits = len(chars) - letters
    if letters > digits:
        return [_TO_LETTER.get(c, c) for c in chars]
    if digits > letters:
        return [_TO_DIGIT.get(c, c) for c in chars]
    return chars


def _quality(avg: float, n_chars: int) -> Tuple[str, str]:
    if n_chars == 0:
        return "no_text", "No characters were found. Try a closer, well-lit photo of the writing."
    if avg >= CLEAR_CONFIDENCE and n_chars >= 2:
        return "clear", "Block letters read clearly."
    if avg >= PARTIAL_CONFIDENCE:
        return "partial", "Some characters are uncertain. Check the highlighted ones."
    return (
        "unreadable",
        "This looks like joined-up (cursive) handwriting. The scanner reads separate block capitals and "
        "digits only, so its guess is not shown as text.",
    )


def _annotate(cv2, image, chars: List[Dict[str, Any]]) -> str:
    """Draw boxes coloured by confidence; return a small JPEG data URL for the UI."""
    canvas = image.copy()
    overlay = image.copy()
    scale = max(canvas.shape[:2]) / 1000.0
    for c in chars:
        x, y, w, h = c["box"]
        conf = c["confidence"]
        color = (94, 160, 47) if conf >= CLEAR_CONFIDENCE else (0, 160, 230) if conf >= 0.6 else (60, 60, 214)
        cv2.rectangle(overlay, (x, y), (x + w, y + h), color, -1)
        cv2.rectangle(canvas, (x, y), (x + w, y + h), color, max(2, round(2 * scale)))
        label = c["char"]
        fs = max(0.5, 0.6 * scale)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, fs, 1)
        ty = max(th + 4, y - 4)
        cv2.rectangle(canvas, (x, ty - th - 4), (x + tw + 6, ty + 2), color, -1)
        cv2.putText(canvas, label, (x + 3, ty - 1), cv2.FONT_HERSHEY_DUPLEX, fs, (255, 255, 255), 1, cv2.LINE_AA)
    canvas = cv2.addWeighted(overlay, 0.18, canvas, 0.82, 0)
    h, w = canvas.shape[:2]
    s = min(1.0, 1100 / max(h, w))
    if s < 1:
        canvas = cv2.resize(canvas, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii") if ok else ""


def read_handwriting(file_bytes: bytes, mime_type: str, *, annotate: bool = True) -> Dict[str, Any]:
    """Read block-letter handwriting from an image or the first page of a PDF."""
    cv2 = _cv2()
    image = decode_to_bgr(file_bytes, mime_type)
    H, W = image.shape[:2]
    scale = min(1.0, MAX_SIDE / max(H, W))
    if scale < 1:
        image = cv2.resize(image, (round(W * scale), round(H * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    lines = _group_lines(_detect_boxes(cv2, gray))
    flat = [b for line in lines for b in line]

    chars: List[Dict[str, Any]] = []
    out_lines: List[Dict[str, Any]] = []
    avg = 0.0
    if flat:
        probs = _classify(np.array([_preprocess_roi(cv2, gray[y:y + h, x:x + w]) for x, y, w, h in flat], dtype="float32"))
        idx, conf = probs.argmax(1), probs.max(1)
        avg = float(conf.mean())
        k = 0
        for line in lines:
            med_h = median(b[3] for b in line)
            gaps = [line[i + 1][0] - (line[i][0] + line[i][2]) for i in range(len(line) - 1)]
            med_gap = median(gaps) if gaps else 0
            words, cur, prev = [], [], None
            for b in line:
                if prev is not None and b[0] - (prev[0] + prev[2]) > max(0.45 * med_h, 2.0 * med_gap):
                    words.append(cur)
                    cur = []
                cur.append(k)
                prev = b
                k += 1
            words.append(cur)
            texts = []
            for word in words:
                fixed = _fix_word([CHARS[idx[i]] for i in word])
                texts.append("".join(fixed))
                for i, ch in zip(word, fixed):
                    x, y, w, h = flat[i]
                    chars.append({"char": ch, "confidence": round(float(conf[i]), 3), "box": [int(x), int(y), int(w), int(h)]})
            line_conf = float(np.mean([conf[i] for w in words for i in w]))
            out_lines.append({"text": " ".join(texts), "confidence": round(line_conf, 3)})

    quality, message = _quality(avg, len(chars))
    readable = quality in ("clear", "partial")
    return {
        "engine": "h_recog block-letter OCR",
        "quality": quality,
        "message": message,
        "text": "\n".join(l["text"] for l in out_lines) if readable else "",
        "lines": out_lines if readable else [],
        "avg_confidence": round(avg, 3),
        "character_count": len(chars),
        "chars": chars,
        "image_size": [int(image.shape[1]), int(image.shape[0])],
        "annotated_image": _annotate(cv2, image, chars) if annotate else None,
    }


def transcript_for_llm(result: Optional[Dict[str, Any]]) -> Optional[str]:
    """Only a CLEAR read is worth showing to the LLM; noisy guesses would mislead it."""
    if not result or result.get("quality") != "clear":
        return None
    return result.get("text") or None
