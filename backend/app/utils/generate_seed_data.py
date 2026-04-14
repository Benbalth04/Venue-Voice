"""
generate_seed_data.py

Generates and inserts simulated survey submission data directly into the database.
Rows are batched to avoid overloading the Supabase connection pooler, with optional
sleep pauses between batches.

Usage:
    python generate_seed_data.py

Dependencies:
    - psycopg2-binary: pip install psycopg2-binary
    - textblob (optional, for better sentiment analysis): pip install textblob
"""

from __future__ import annotations

import hashlib
import json
import random
import time
import uuid
from datetime import datetime, timedelta

import psycopg2
import psycopg2.extras

# ── Supabase Config ──────────────────────────────────────────────────
DATABASE_URL = (
    ""
    ""
)

# ── Optional textblob import ──────────────────────────────────────────────────
try:
    from textblob import TextBlob  # type: ignore
    _TEXTBLOB_AVAILABLE = True
except ImportError:
    _TEXTBLOB_AVAILABLE = False

# ── Fixed base entity IDs (from database/02_seed.sql) ────────────────────────
COMPANY_ID = 'f0ec16ab-3bde-4832-a211-880750141317'

# Key is location id
LOCATION_QR_CODE_MAP = {
    '7b35e6d5-1948-4a9c-a285-debed9e683c3': {"location_name": 'Location 1', "qr_code_id": '51fdab00-e9c6-4a53-8519-eb1f9bdd2df7', "positive_probability": 0.80},
    '92215f74-6646-43ad-aafa-4a14be6a723d': {"location_name": 'Location 2', "qr_code_id": 'eee669a5-58f3-422d-8547-6a9bbb595b17', "positive_probability": 0.55},
    '5798710e-eb2a-4e7c-91a5-bc419d593bda': {"location_name": 'Location 3', "qr_code_id": '7c00633c-c938-4365-b6f8-8c7e8b09db1a', "positive_probability": 0.30},
}

SURVEY_VERSION_ID = '6a424372-d5c3-4641-959d-03442fe4dfec'

# ── Question definitions for survey version 3 ────────────────────────────────
# q_id = questions.id (PK), stable_q_id = questions.stable_question_id
# Both are deterministic: uuid5(NAMESPACE_DNS, "venue-voice.q.{id|stable}.{question_key}")
QUESTIONS = [
    {
        "question_key":  "3c19d745-117f-490e-b291-5acd08d514d5",
        "q_id":          "a4b22b74-1d52-4ffd-ad59-724a53039945",
        "stable_q_id":   "3aad5287-eb91-4288-9301-2c4d10373634",
        "question_text": "How would you rate your overall experience here today?",
        "question_type": "star",
        "config": {
            "starCount": 5,
            "text_size": "medium",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      0,
        "is_numeric":    True,
    },
    {
        "question_key":  "71d20c20-194f-480f-ad23-d2f2095e1d67",
        "q_id":          "894579f1-1600-4a1f-8403-4d958bfb414e",
        "stable_q_id":   "68102bf0-fcd8-4037-9914-93ecf1c62c95",
        "question_text": "How would you rate our coffee?",
        "question_type": "star",
        "config": {
            "starCount": 5,
            "text_size": "medium",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      1,
        "is_numeric":    True,
    },
    {
        "question_key":  "20e21c14-8fe0-42a0-b7d0-c51c57d242cb",
        "q_id":          "90feb899-d193-47cd-8345-90f95998ca31",
        "stable_q_id":   "f73c46bf-2959-47f4-8394-454188fc13ab",
        "question_text": "How would you rate our service?",
        "question_type": "star",
        "config": {
            "starCount": 5,
            "text_size": "medium",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      2,
        "is_numeric":    True,
    },
    {
        "question_key":  "7a08ac8e-5d8c-44cd-abba-32e42dcd40ae",
        "q_id":          "d784a026-4d8c-4de4-bcfd-c6ce1285f138",
        "stable_q_id":   "c56a166c-68f5-48e2-9232-e2c4cd81daa0",
        "question_text": "(Optional) Anything else you would like to add?",
        "question_type": "long_text",
        "config": {
            "text_size": "medium",
            "placeholder": "Type your answer...",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      3,
        "is_numeric":    False,
    },
    {
        "question_key":  "ca46ba73-a32a-419f-a894-63353b93383c",
        "q_id":          "7b0bc2e9-06ce-4782-b551-389c61fc5346",
        "stable_q_id":   "f6a62439-94f6-40f0-94e1-1786864ace56",
        "question_text": "(Optional) Add a photo from your experience",
        "question_type": "photo",
        "config": {
            "text_size": "medium",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      4,
        "is_numeric":    False,
    },
]


# ── Text pools for text/long_text questions ───────────────────────────────────
LONG_TEXT_POOL: dict[str, list[str]] = {
    "positive": [
        "The experience was absolutely amazing and the team was super friendly. Will definitely be back!",
        "Incredible experience from start to finish. Everything was handled perfectly and service was exceptional.",
        "We had a wonderful time. Everything was clean, well-organised and the staff were incredibly welcoming.",
        "Outstanding. The quality exceeded expectations and the team was attentive and professional.",
    ],
    "negative": [
        "Quite disappointed. The experience didn't meet expectations and the wait was longer than expected.",
        "Not what we expected. The service was slow and the staff seemed indifferent.",
        "The place was overcrowded and the environment made it difficult to enjoy ourselves.",
        "Poor value for money. The quality did not match the price and we left feeling let down.",
    ],
    "neutral": [
        "An okay experience overall. It was fine but nothing particularly stood out.",
        "Average visit. The service was decent but a few things could use improvement.",
        "Neither great nor terrible. It met basic expectations but didn't exceed them.",
    ],
}

SHORT_TEXT_POOL: dict[str, list[str]] = {
    "positive": [
        "Great service, really happy with the experience!",
        "Loved it, will definitely return.",
        "Excellent experience, highly recommended.",
        "Absolutely brilliant, thank you!",
    ],
    "negative": [
        "Not happy with the service, quite disappointing.",
        "Poor experience overall, would not recommend.",
        "Left feeling let down — won't be returning.",
    ],
    "neutral": [
        "It was okay, nothing special.",
        "Average experience, could be better.",
        "Decent but not outstanding.",
    ],
}

# ── User-agents pool ──────────────────────────────────────────────────────────
USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "desktop", "chrome",
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "desktop", "safari",
    ),
    (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "mobile", "safari",
    ),
    (
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        "mobile", "chrome",
    ),
    (
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "tablet", "safari",
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
        "desktop", "firefox",
    ),
]

# ── AI prompt template ────────────────────────────────────────────────────────
_SENTIMENT_PROMPT_PREFIX = (
    "You are a strict sentiment classification engine.\n\n"
    "Task:\nClassify the sentiment of the user text.\n\n"
    "Rules:\n"
    "- Output ONLY a valid JSON object.\n"
    "- Do NOT include markdown, explanations, or extra text.\n"
    "- Do NOT include any keys other than 'sentiment' and 'score'.\n"
    "- 'sentiment' must be exactly one of: positive, neutral, negative.\n"
    "- 'score' must be a number between -1 and 1.\n"
    "- Use negative values for negative sentiment, positive values for positive sentiment.\n"
    "- If the sentiment is mixed, unclear, or balanced, return 'neutral'.\n"
    "- Keep the score proportional to strength "
    "(e.g., strong negative \u2248 -0.8 to -1, mild \u2248 -0.2).\n"
    "- Always include both keys.\n"
    "- Never return null.\n\n"
    'Output format example:\n{"sentiment": "neutral", "score": 0.0}\n'
    "---\n"
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _random_datetime(start: datetime, end: datetime) -> datetime:
    delta = end - start
    seconds = random.randint(0, max(1, int(delta.total_seconds())))
    return start + timedelta(seconds=seconds)


def _random_ip() -> str:
    return (
        f"{random.randint(1, 254)}.{random.randint(0, 255)}"
        f".{random.randint(0, 255)}.{random.randint(1, 254)}"
    )


def _hash_ip(ip: str) -> str:
    return hashlib.md5(ip.encode()).hexdigest()


def _get_sentiment(text: str) -> tuple[str, float]:
    if _TEXTBLOB_AVAILABLE:
        polarity = round(TextBlob(text).sentiment.polarity, 4)
    else:
        positive_words = {
            "great", "excellent", "love", "wonderful", "amazing", "fantastic",
            "outstanding", "incredible", "brilliant", "happy", "perfect",
            "memorable", "stunning", "attentive", "welcoming", "comfortable",
        }
        negative_words = {
            "poor", "bad", "terrible", "hate", "disappointing", "awful",
            "underwhelming", "rude", "unhelpful", "neglected", "overcrowded",
            "slow", "indifferent", "excessive", "unacceptable",
        }
        lower = text.lower()
        pos = sum(1 for w in positive_words if w in lower)
        neg = sum(1 for w in negative_words if w in lower)
        if pos > neg:
            polarity = 0.5
        elif neg > pos:
            polarity = -0.5
        else:
            polarity = 0.0

    if polarity > 0.1:
        return "positive", polarity
    elif polarity < -0.1:
        return "negative", polarity
    return "neutral", polarity


def _pick_sentiment(positive_prob: float) -> str:
    r = random.random()
    if r < positive_prob:
        return "positive"
    elif r < positive_prob + (1.0 - positive_prob) / 2:
        return "negative"
    return "neutral"


def _generate_answer(q: dict, response_idx: int, photo_urls: list[str], positive_prob: float = 0.6) -> dict:
    qt = q["question_type"]
    options = ["Option 1", "Option 2", "Option 3", "Option 4"]

    if qt == "checkbox":
        chosen = random.sample(options, k=random.randint(1, 3))
        return dict(answers_value=chosen, text_value=", ".join(chosen), numeric_value=None, photo_url=None, ai_text=None)

    if qt == "multiple_choice":
        chosen = random.choice(options)
        return dict(answers_value=chosen, text_value=chosen, numeric_value=None, photo_url=None, ai_text=None)

    if qt == "yes_no":
        chosen = random.choice(["Yes", "No"])
        return dict(answers_value=chosen, text_value=chosen, numeric_value=None, photo_url=None, ai_text=None)

    if qt == "email":
        val = f"user{response_idx}@example.com"
        return dict(answers_value=val, text_value=val, numeric_value=None, photo_url=None, ai_text=None)

    if qt == "phone":
        digits = "".join(str(random.randint(0, 9)) for _ in range(9))
        val = f"+61 4{digits[0:2]} {digits[2:5]} {digits[5:9]}"
        return dict(answers_value=val, text_value=val, numeric_value=None, photo_url=None, ai_text=None)

    if qt == "photo":
        url = random.choice(photo_urls) if photo_urls else "https://placehold.co/800x600.jpg"
        return dict(answers_value=None, text_value=None, numeric_value=None, photo_url=url, ai_text=None)

    if qt == "nps":
        sentiment = _pick_sentiment(positive_prob)
        if sentiment == "positive":
            val = random.randint(8, 10)
        elif sentiment == "negative":
            val = random.randint(0, 4)
        else:
            val = random.randint(5, 7)
        return dict(answers_value=val, text_value=None, numeric_value=val, photo_url=None, ai_text=None)

    if qt == "star":
        sentiment = _pick_sentiment(positive_prob)
        if sentiment == "positive":
            val = random.randint(4, 5)
        elif sentiment == "negative":
            val = random.randint(1, 2)
        else:
            val = 3
        return dict(answers_value=val, text_value=None, numeric_value=val, photo_url=None, ai_text=None)

    if qt == "long_text":
        sentiment = _pick_sentiment(positive_prob)
        text = random.choice(LONG_TEXT_POOL[sentiment])
        return dict(answers_value=text, text_value=text, numeric_value=None, photo_url=None, ai_text=text)

    if qt == "text":
        sentiment = _pick_sentiment(positive_prob)
        text = random.choice(SHORT_TEXT_POOL[sentiment])
        return dict(answers_value=text, text_value=text, numeric_value=None, photo_url=None, ai_text=text)

    raise ValueError(f"Unknown question type: {qt}")


# ── Data builders (return dicts of row-tuples, one key per table) ─────────────

def _build_response_data(
    response_idx: int,
    start_date: datetime,
    end_date: datetime,
    photo_urls: list[str],
) -> dict[str, list[tuple]]:
    """
    Build all rows for a single completed survey response.
    Returns a dict keyed by table name, each value a list of row tuples
    matching the column order defined in _INSERT_SPECS.
    """
    scan_ts = _random_datetime(start_date, end_date)
    time_taken_secs = random.randint(20, 180)
    end_ts = scan_ts + timedelta(seconds=time_taken_secs)

    ip = _random_ip()
    hashed_ip = _hash_ip(ip)
    ua_str, device_type, browser = random.choice(USER_AGENTS)

    snap_id    = str(uuid.uuid4())
    scan_id    = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    resp_id    = str(uuid.uuid4())

    location_id = random.choice(list(LOCATION_QR_CODE_MAP.keys()))
    location_info = LOCATION_QR_CODE_MAP[location_id]
    location_name = location_info["location_name"]
    qr_code_id = location_info["qr_code_id"]
    positive_prob = location_info["positive_probability"]

    rows: dict[str, list[tuple]] = {
        "location_snapshots": [],
        "scan_events": [],
        "survey_sessions": [],
        "survey_responses": [],
        "survey_response_answers": [],
        "survey_response_photos": [],
        "ai_analysis": [],
    }

    rows["location_snapshots"].append(
        (snap_id, location_id, location_name, None, None, scan_ts, None)
    )

    rows["scan_events"].append(
        (scan_id, qr_code_id, COMPANY_ID, snap_id, scan_ts, ip, ua_str, session_id, None)
    )

    rows["survey_sessions"].append(
        (session_id, scan_id, SURVEY_VERSION_ID, qr_code_id, COMPANY_ID, snap_id,
         scan_ts, end_ts, False, device_type, browser, hashed_ip, None)
    )

    answers_dict: dict = {}
    for q in QUESTIONS:
        ans = _generate_answer(q, response_idx, photo_urls, positive_prob)

        if q["question_type"] != "photo" and ans["answers_value"] is not None:
            answers_dict[q["question_key"]] = ans["answers_value"]

        if ans["text_value"] is not None:
            rows["survey_response_answers"].append(
                (str(uuid.uuid4()), resp_id, q["stable_q_id"], ans["text_value"], None, end_ts, None)
            )
        elif ans["numeric_value"] is not None:
            rows["survey_response_answers"].append(
                (str(uuid.uuid4()), resp_id, q["stable_q_id"], None, ans["numeric_value"], end_ts, None)
            )

        if ans["photo_url"] is not None:
            storage_path = ans["photo_url"]
            file_size = random.randint(50_000, 800_000)
            rows["survey_response_photos"].append(
                (str(uuid.uuid4()), resp_id, q["stable_q_id"], storage_path, "image/jpeg", file_size, end_ts)
            )
            rows["survey_response_answers"].append(
                (str(uuid.uuid4()), resp_id, q["stable_q_id"], storage_path, None, end_ts, None)
            )

        if ans["ai_text"] is not None:
            sentiment_label, polarity = _get_sentiment(ans["ai_text"])
            score = round(polarity, 4)
            analysis_dict = {"sentiment": sentiment_label, "score": score}
            raw_response_value = json.dumps(json.dumps(analysis_dict))
            full_prompt = _SENTIMENT_PROMPT_PREFIX + ans["ai_text"]
            processing_ms = random.randint(100, 3000)
            rows["ai_analysis"].append(
                (str(uuid.uuid4()), COMPANY_ID, location_id, resp_id, q["stable_q_id"],
                 full_prompt, raw_response_value, psycopg2.extras.Json(analysis_dict),
                 sentiment_label, score, "simulated", None, 1, "completed",
                 processing_ms, None, end_ts, None)
            )

    rows["survey_responses"].append(
        (resp_id, SURVEY_VERSION_ID, session_id, qr_code_id, snap_id,
         psycopg2.extras.Json(answers_dict), end_ts, time_taken_secs,
         device_type, browser, hashed_ip, None)
    )

    return rows


def _build_abandoned_scan_data(
    start_date: datetime,
    end_date: datetime,
) -> dict[str, list[tuple]]:
    """
    Build rows for a scan that was never completed (abandoned session).
    """
    scan_ts = _random_datetime(start_date, end_date)
    bounce_secs = random.randint(3, 30)
    bounce_ts = scan_ts + timedelta(seconds=bounce_secs)

    ip = _random_ip()
    hashed_ip = _hash_ip(ip)
    ua_str, device_type, browser = random.choice(USER_AGENTS)

    snap_id    = str(uuid.uuid4())
    scan_id    = str(uuid.uuid4())
    session_id = str(uuid.uuid4())

    location_id = random.choice(list(LOCATION_QR_CODE_MAP.keys()))
    location_info = LOCATION_QR_CODE_MAP[location_id]
    location_name = location_info["location_name"]
    qr_code_id = location_info["qr_code_id"]

    return {
        "location_snapshots": [
            (snap_id, location_id, location_name, None, None, scan_ts, None)
        ],
        "scan_events": [
            (scan_id, qr_code_id, COMPANY_ID, snap_id, scan_ts, ip, ua_str, session_id, None)
        ],
        "survey_sessions": [
            (session_id, scan_id, SURVEY_VERSION_ID, qr_code_id, COMPANY_ID, snap_id,
             scan_ts, bounce_ts, True, device_type, browser, hashed_ip, None)
        ],
        "survey_responses": [],
        "survey_response_answers": [],
        "survey_response_photos": [],
        "ai_analysis": [],
    }


# ── Column specs for each table (used in INSERT statements) ───────────────────

_INSERT_SPECS: dict[str, tuple[str, str]] = {
    "location_snapshots": (
        "location_snapshots",
        "(id, location_id, name, state, country, created_at, deleted_at)"
    ),
    "scan_events": (
        "scan_events",
        "(id, qr_code_id, company_id, location_snapshot_id, scanned_at, "
        "ip_address, user_agent, session_id, deleted_at)"
    ),
    "survey_sessions": (
        "survey_sessions",
        "(id, scan_id, survey_version_id, qr_code_id, company_id, location_snapshot_id, "
        "start_time, end_time, abandoned, device_type, browser, hashed_ip_address, deleted_at)"
    ),
    "survey_responses": (
        "survey_responses",
        "(id, survey_version_id, session_id, qr_code_id, location_snapshot_id, "
        "answers, completion_datetime, time_taken_seconds, "
        "device_type, browser, hashed_ip_address, deleted_at)"
    ),
    "survey_response_answers": (
        "survey_response_answers",
        "(id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at)"
    ),
    "survey_response_photos": (
        "survey_response_photos",
        "(id, survey_response_id, question_id, storage_path, mime_type, file_size_bytes, created_at)"
    ),
    "ai_analysis": (
        "ai_analysis",
        "(id, company_id, location_id, survey_response_id, question_id, "
        "prompt, raw_response, analysis, sentiment, sentiment_score, "
        "model, model_version, analysis_version, status, processing_time_ms, "
        "error, created_at, deleted_at)"
    ),
}

# Insertion order matters: parent rows before child rows
_TABLE_ORDER = [
    "location_snapshots",
    "scan_events",
    "survey_sessions",
    "survey_responses",
    "survey_response_answers",
    "survey_response_photos",
    "ai_analysis",
]


def _questions_bootstrap_db(cur: psycopg2.extensions.cursor) -> None:
    """Upsert all question definitions (idempotent)."""
    for q in QUESTIONS:
        cur.execute(
            """
            INSERT INTO questions
                (id, stable_question_id, survey_version_id, question_key, question_text,
                 question_type, config, position, is_numeric, deleted_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NULL)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                q["q_id"],
                q["stable_q_id"],
                SURVEY_VERSION_ID,
                q["question_key"],
                q["question_text"],
                q["question_type"],
                psycopg2.extras.Json(q["config"]),
                q["position"],
                q["is_numeric"],
            ),
        )


def _flush_batch(
    cur: psycopg2.extensions.cursor,
    batch: dict[str, list[tuple]],
) -> None:
    """Insert all accumulated rows for a batch, table by table."""
    for table in _TABLE_ORDER:
        rows = batch.get(table, [])
        if not rows:
            continue
        _, cols = _INSERT_SPECS[table]
        col_count = len(rows[0])
        placeholders = "(" + ", ".join(["%s"] * col_count) + ")"
        sql = f"INSERT INTO {table} {cols} VALUES {placeholders} ON CONFLICT DO NOTHING"
        psycopg2.extras.execute_batch(cur, sql, rows, page_size=200)


def _merge_batch(
    accumulator: dict[str, list[tuple]],
    new_rows: dict[str, list[tuple]],
) -> None:
    for table, rows in new_rows.items():
        accumulator.setdefault(table, []).extend(rows)


# ── Public API ────────────────────────────────────────────────────────────────

def generate_survey_responses(
    num_responses: int,
    start_date: datetime,
    end_date: datetime,
    response_photo_urls: list[str],
    scan_completion_rate: float = 0.65,
    seed: int | None = 42,
    batch_size: int = 50,
    sleep_between_batches: float = 1.0,
) -> None:
    """
    Generate and insert `num_responses` simulated survey submissions directly into
    the database, plus a proportional number of abandoned scans.

    Args:
        num_responses:          Number of completed survey responses to generate.
        start_date:             Earliest possible response datetime.
        end_date:               Latest possible response datetime.
        response_photo_urls:    Pool of photo URLs to randomly assign to photo questions.
        scan_completion_rate:   Fraction of all scans that result in a completed response.
        seed:                   Random seed for reproducibility (None for true randomness).
        batch_size:             Number of completed responses per database transaction.
        sleep_between_batches:  Seconds to sleep between each committed batch.
    """
    if seed is not None:
        random.seed(seed)

    scan_completion_rate = max(0.01, min(1.0, scan_completion_rate))
    num_abandoned = round(num_responses * (1.0 - scan_completion_rate) / scan_completion_rate)

    print(f"Connecting to database…")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            print("Bootstrapping questions…")
            _questions_bootstrap_db(cur)
            conn.commit()

        total_completed = 0
        total_abandoned = 0

        # Interleave completed responses and abandoned scans across batches so
        # that each batch has a realistic mix.
        abandoned_per_batch = num_abandoned / max(1, num_responses / batch_size)

        i_response = 0
        i_abandoned = 0
        batch_num = 0

        while i_response < num_responses or i_abandoned < num_abandoned:
            batch: dict[str, list[tuple]] = {t: [] for t in _TABLE_ORDER}
            batch_completed = 0
            batch_aband = 0

            # Add up to batch_size completed responses
            for _ in range(batch_size):
                if i_response >= num_responses:
                    break
                _merge_batch(batch, _build_response_data(i_response, start_date, end_date, response_photo_urls))
                i_response += 1
                batch_completed += 1

            # Add proportional abandoned scans for this batch
            target_abandoned = min(num_abandoned, round((batch_num + 1) * abandoned_per_batch))
            while i_abandoned < target_abandoned:
                _merge_batch(batch, _build_abandoned_scan_data(start_date, end_date))
                i_abandoned += 1
                batch_aband += 1

            with conn.cursor() as cur:
                _flush_batch(cur, batch)
            conn.commit()

            total_completed += batch_completed
            total_abandoned += batch_aband
            batch_num += 1

            print(
                f"  Batch {batch_num}: +{batch_completed} responses, +{batch_aband} abandoned "
                f"— total {total_completed}/{num_responses} responses, "
                f"{total_abandoned}/{num_abandoned} abandoned"
            )

            if (i_response < num_responses or i_abandoned < num_abandoned) and sleep_between_batches > 0:
                time.sleep(sleep_between_batches)

        # Flush any remaining abandoned scans not yet written
        if i_abandoned < num_abandoned:
            batch = {t: [] for t in _TABLE_ORDER}
            remaining = 0
            while i_abandoned < num_abandoned:
                _merge_batch(batch, _build_abandoned_scan_data(start_date, end_date))
                i_abandoned += 1
                remaining += 1
            with conn.cursor() as cur:
                _flush_batch(cur, batch)
            conn.commit()
            total_abandoned += remaining
            print(f"  Final flush: +{remaining} abandoned scans")

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(
        f"\nDone. Inserted {total_completed} completed responses "
        f"and {total_abandoned} abandoned scans."
    )
    if not _TEXTBLOB_AVAILABLE:
        print("Note: textblob not installed — using keyword-based sentiment fallback.")
        print("      Install with: pip install textblob")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    generate_survey_responses(
        num_responses=1000,
        start_date=datetime(2026, 2, 1),
        end_date=datetime(2026, 4, 14),
        response_photo_urls=[
            "2bbabb89-5074-442b-9504-7634224bdf64/ca46ba73-a32a-419f-a894-63353b93383c.jpg",
            "8be61090-277f-4076-9539-356a48120ce9/ca46ba73-a32a-419f-a894-63353b93383c.jpg",
            "cf7f6cb6-1911-4003-8832-876aa0141669/ca46ba73-a32a-419f-a894-63353b93383c.jpg",
        ],
        scan_completion_rate=0.65,
        batch_size=50,
        sleep_between_batches=1.0,
    )
