"""Small "pregnancy research news" card for the app and website.

Real news only: the latest items from ScienceDaily's "Pregnancy & Childbirth" research feed. Gemini (plain call,
no web search needed) picks the item most useful to a pregnant reader and rewrites its headline and summary in
plain language; without Gemini the newest item is used as published. If the feed is down, a hand-checked daily
tip is returned instead, clearly marked as a tip. Results are cached for 6 hours.
"""

from __future__ import annotations

import html
import json
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from typing import List, Optional

import requests

from gemini_client import gemini_enabled, generate, strip_code_fences

FEED_URL = "https://www.sciencedaily.com/rss/health_medicine/pregnancy_and_childbirth.xml"
SOURCE = "ScienceDaily"
TTL_S = 6 * 3600
_cache: dict = {"at": 0.0, "value": None}
_lock = threading.Lock()

TIPS = [
    ("Iron works better with vitamin C", "Take iron tablets with orange juice or a vitamin C-rich fruit, and keep tea and coffee an hour away from them."),
    ("Keep caffeine under 200 mg a day", "That's about two cups of instant coffee. Tea, cola, chocolate and some cold medicines count too."),
    ("Sleep on your side later in pregnancy", "From about 28 weeks, going to sleep on your side is linked to a lower risk of stillbirth."),
    ("Get to know your baby's movements", "From around 24 weeks, if movements slow down or change, call your maternity unit the same day."),
    ("Folic acid matters most early on", "400 micrograms a day helps prevent neural tube defects, ideally from before pregnancy until 12 weeks."),
    ("Stay active, gently", "About 150 minutes of moderate activity a week, like brisk walking or swimming, is recommended if your pregnancy is healthy."),
    ("Wash fruit and vegetables well", "It removes soil that can carry toxoplasmosis. Cook meat until no pink remains."),
    ("Drink to thirst, a little more", "Pale yellow urine is a simple sign you're drinking enough; dehydration can make constipation worse."),
    ("Ask about vaccines in pregnancy", "Flu and whooping-cough vaccines in pregnancy protect your baby in the first months after birth."),
    ("Headache, blurred vision or swelling?", "Sudden swelling of the face or hands, a bad headache or vision changes can be signs of pre-eclampsia. Call your doctor."),
    ("Avoid unpasteurised milk and soft cheeses", "They can carry listeria. Hard cheeses and pasteurised dairy are fine."),
    ("Look after your teeth", "Pregnancy hormones can make gums bleed more easily. Dental check-ups are safe and worthwhile."),
]


def _tip() -> dict:
    title, body = TIPS[date.today().toordinal() % len(TIPS)]
    return {"kind": "tip", "headline": title, "summary": body, "source": "MamaCare tips", "url": None, "published": None, "topic": "Daily tip", "ai_summary": False}


def _clean(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def _fetch_items(limit: int = 12) -> List[dict]:
    res = requests.get(FEED_URL, headers={"User-Agent": "MamaCare/1.0 (pregnancy app)"}, timeout=15)
    res.raise_for_status()
    root = ET.fromstring(res.content)
    items = []
    for it in root.iter("item"):
        title, link = _clean(it.findtext("title")), (it.findtext("link") or "").strip()
        if not title or not link.startswith("http"):
            continue
        published = None
        try:
            published = parsedate_to_datetime(it.findtext("pubDate") or "").astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError):
            pass
        items.append({"title": title, "url": link, "description": _clean(it.findtext("description"))[:500], "published": published})
        if len(items) >= limit:
            break
    return items


def _pick_with_gemini(items: List[dict]) -> Optional[dict]:
    listing = "\n".join(f"{i}. {it['title']} — {it['description'][:240]}" for i, it in enumerate(items))
    prompt = (
        "You write a small news card in a pregnancy app. From these research news items, pick the ONE most relevant "
        "and useful to a pregnant woman (prefer pregnancy, birth, nutrition or baby health; avoid alarming items "
        "unless important). Rewrite it in plain, calm language. Do not give medical advice beyond suggesting she "
        "talks to her doctor, and do not add facts that are not in the item. Keep the headline faithful: never "
        "say a study is about pregnancy unless the item says so, and make the topic name the item's real subject.\n\n"
        f"{listing}\n\n"
        'Reply with JSON only: {"index": <number>, "headline": "<max 80 characters>", '
        '"summary": "<one sentence, max 170 characters>", "topic": "<2-3 words>"}'
    )
    text = generate([{"text": prompt}], temperature=0.2, max_output_tokens=300, json_mode=True, timeout_s=25)
    if not text:
        return None
    try:
        data = json.loads(strip_code_fences(text))
        idx = int(data["index"])
        headline, summary = str(data["headline"]).strip(), str(data["summary"]).strip()
    except (ValueError, KeyError, TypeError):
        return None
    if not (0 <= idx < len(items)) or not headline or not summary:
        return None
    item = items[idx]
    return {
        "kind": "news", "headline": headline[:100], "summary": summary[:220], "source": SOURCE, "url": item["url"],
        "published": item["published"], "topic": str(data.get("topic") or "Research")[:30], "ai_summary": True,
    }


def latest_news(force: bool = False) -> dict:
    with _lock:
        if not force and _cache["value"] and time.time() - _cache["at"] < TTL_S:
            return _cache["value"]
    try:
        items = _fetch_items()
    except (requests.RequestException, ET.ParseError):
        items = []
    value = None
    if items:
        value = _pick_with_gemini(items) if gemini_enabled() else None
        if value is None:
            first = items[0]
            value = {"kind": "news", "headline": first["title"][:100], "summary": first["description"][:220], "source": SOURCE,
                     "url": first["url"], "published": first["published"], "topic": "Research", "ai_summary": False}
    if value is None:
        return _tip()  # don't cache the fallback: try the feed again next time
    value["fetched_at"] = datetime.now(timezone.utc).isoformat()
    with _lock:
        _cache.update(at=time.time(), value=value)
    return value
