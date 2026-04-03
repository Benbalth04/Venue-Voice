"""
generate_seed_data.py

Generates SQL INSERT statements simulating the full QR-scan → survey-submission
lifecycle for bulk seed data. Writes output to a .sql file.

Usage:
    python generate_seed_data.py

Dependencies:
    - textblob (optional, for better sentiment analysis): pip install textblob
"""

from __future__ import annotations

import hashlib
import json
import random
import uuid
from datetime import datetime, timedelta

# ── Optional textblob import ──────────────────────────────────────────────────
try:
    from textblob import TextBlob  # type: ignore
    _TEXTBLOB_AVAILABLE = True
except ImportError:
    _TEXTBLOB_AVAILABLE = False

# ── Fixed base entity IDs (from database/02_seed.sql) ────────────────────────
COMPANY_ID = '02238978-8b23-408a-a5e4-a0399578229a'

# Key is location id
LOCATION_QR_CODE_MAP = {
    '87ff1d9a-d62a-425f-a378-06bab8438eb7': {"location_name": 'Main Venue', "qr_code_id": '9b32692f-3ed4-4c48-89fa-f076b57e42c3'},
    '3d2e93eb-440f-4b08-81bb-2bdd2a8b2595': {"location_name": 'Venue 1', "qr_code_id": 'b56aebcc-f7b4-4fdb-88d6-b25251dd2873'},
    '32dd0259-a813-4df5-b6c5-6d2101a8e907': {"location_name": 'Venue 2', "qr_code_id": 'd8c564c4-9a4d-40c1-9499-fed1e2031869'},
    '38c2a937-9f6f-4d28-9aed-03f2670f5bb1': {"location_name": 'Venue 3', "qr_code_id": '63a3692e-e922-499c-bc0e-143874178b80'},
}

SURVEY_VERSION_ID = 'c8894ef5-0110-46ad-a87f-52f7c40d7253'

# ── Question definitions for survey version 3 ────────────────────────────────
# q_id = questions.id (PK), stable_q_id = questions.stable_question_id
# Both are deterministic: uuid5(NAMESPACE_DNS, "venue-voice.q.{id|stable}.{question_key}")
QUESTIONS = [
    {
        "question_key":  "ca07b7a6-8ecd-4917-adad-97abda063a20",
        "q_id":          "7fd86603-d3b0-41a1-879f-803f68474f2c",
        "stable_q_id":   "b2644512-4db1-429c-a433-93549285ba20",
        "question_text": "How would you rate your experience today?",
        "question_type": "star",
        "config": {
            "optional": False,
            "starCount": 5,
            "text_size": "medium",
            "selected_colour": "#7C3AED",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      0,
        "is_numeric":    True,
    },
    {
        "question_key":  "89159a1b-7694-47ef-90cb-673aa24d465c",
        "q_id":          "934f5d3c-89f2-4d5b-9d9a-ed91220910c5",
        "stable_q_id":   "3707bc0f-558f-48a7-afd7-b205eb26ca47",
        "question_text": "How likely are you to recommend us?",
        "question_type": "nps",
        "config": {
            "optional": False,
            "max_label": "Extremely likely",
            "max_score": 10,
            "min_label": "Not likely",
            "text_size": "medium",
            "selected_colour": "#7C3AED",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      1,
        "is_numeric":    True,
    },
    {
        "question_key":  "1a942a63-9662-4c3f-96f1-6011f61834ca",
        "q_id":          "edf8937b-473f-4005-acb1-0c2dfbba75dc",
        "stable_q_id":   "ffea322b-be78-4e65-b282-3e7ea72ecf92",
        "question_text": "Anything else you would like to add?",
        "question_type": "text",
        "config": {
            "optional": False,
            "text_size": "medium",
            "placeholder": "Type your answer...",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      2,
        "is_numeric":    False,
    },
    {
        "question_key":  "61500049-eee2-4cad-b3ee-96e1a7716f21",
        "q_id":          "9cc4370c-1d58-4c7f-bf5d-b4aeb95eae1c",
        "stable_q_id":   "84d7fec3-f459-44cf-b289-455b98aaf6ad",
        "question_text": "Checkbox question",
        "question_type": "checkbox",
        "config": {
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "optional": False,
            "text_size": "medium",
            "selected_colour": "#7C3AED",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      0,
        "is_numeric":    False,
    },
    {
        "question_key":  "60e49982-c21b-46c7-9323-96502595f686",
        "q_id":          "0c97eb8f-b997-4e7c-923f-33c0901c3dcf",
        "stable_q_id":   "b9babcf9-80ae-4d0d-a9fb-4fdb9686ef82",
        "question_text": "Multiple Choice Question",
        "question_type": "multiple_choice",
        "config": {
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "optional": False,
            "text_size": "medium",
            "selected_colour": "#7C3AED",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      1,
        "is_numeric":    False,
    },
    {
        "question_key":  "04e9cfa0-e8ae-42e7-9c8c-45b631f52e13",
        "q_id":          "3e86a12e-1798-4616-90e2-b3843f447430",
        "stable_q_id":   "6fbf5ea7-a97f-45c9-83bc-2a751a24bbdc",
        "question_text": "Yes No Question",
        "question_type": "yes_no",
        "config": {
            "noLabel": "No",
            "yesLabel": "Yes",
            "optional": False,
            "text_size": "medium",
            "selected_colour": "#7C3AED",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      2,
        "is_numeric":    False,
    },
    {
        "question_key":  "ca5c6ec6-4233-42a4-b9a4-9cc369685f41",
        "q_id":          "8330c1f6-192f-4125-b7f8-25d3f973c5e1",
        "stable_q_id":   "f584028c-9614-4181-a236-da31d268ae8d",
        "question_text": "Email Question",
        "question_type": "email",
        "config": {
            "optional": False,
            "text_size": "medium",
            "placeholder": "your@email.com",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      3,
        "is_numeric":    False,
    },
    {
        "question_key":  "2146ed2c-10fe-4b9c-8b2f-03e136e34143",
        "q_id":          "3eb3c283-c349-4124-b03d-e7027880db1b",
        "stable_q_id":   "6afaa181-0897-4a3f-b9d8-f5bdcf53df80",
        "question_text": "Phone question",
        "question_type": "phone",
        "config": {
            "optional": False,
            "text_size": "medium",
            "placeholder": "+61 400 000 000",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      4,
        "is_numeric":    False,
    },
    {
        "question_key":  "f0de0f8b-bf88-45c4-8d41-8d04757918a6",
        "q_id":          "0f5bc194-d5f9-4fbf-bb3d-451460347db0",
        "stable_q_id":   "348b0939-a00a-43e5-8e2b-e8a9afa53191",
        "question_text": "Photo Question",
        "question_type": "photo",
        "config": {
            "optional": True,
            "text_size": "medium",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      5,
        "is_numeric":    False,
    },
    {
        "question_key":  "12c660f0-d76f-4b00-ba2d-0e1d7f6e76ae",
        "q_id":          "246a1121-fc1d-4620-9453-fba208e4ea6f",
        "stable_q_id":   "b991924d-e1a3-45c1-93cb-a8bc97e3d532",
        "question_text": "NPS Question",
        "question_type": "nps",
        "config": {
            "optional": False,
            "max_label": "Extremely likely",
            "max_score": 10,
            "min_label": "Not likely",
            "text_size": "medium",
            "selected_colour": "#7C3AED",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      6,
        "is_numeric":    True,
    },
    {
        "question_key":  "8d959f1c-98bd-453d-be80-cda3a7065dde",
        "q_id":          "4660a3a3-a83d-4e40-9813-6e9d3a5aa161",
        "stable_q_id":   "09cf0639-88c3-4b13-9040-a4c9c023f84e",
        "question_text": "Star Question",
        "question_type": "star",
        "config": {
            "optional": False,
            "starCount": 5,
            "text_size": "medium",
            "selected_colour": "#7C3AED",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      7,
        "is_numeric":    True,
    },
    {
        "question_key":  "ddcf1769-d076-4c2c-a48c-409d2fda7692",
        "q_id":          "b3ca04c7-8bd3-41c5-ba21-9000c4385b82",
        "stable_q_id":   "04a4029a-63f0-49b1-8c83-8eb66d87e69f",
        "question_text": "Long Text Question",
        "question_type": "long_text",
        "config": {
            "optional": False,
            "text_size": "medium",
            "placeholder": "Type your answer...",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      8,
        "is_numeric":    False,
    },
    {
        "question_key":  "98421284-64f3-42f2-88e1-d5a9bd8ebbd9",
        "q_id":          "db1b21f3-9b98-494b-bb7c-b1e79ce64a3c",
        "stable_q_id":   "43997ae4-d39b-46f3-b8dc-3129d9db5a39",
        "question_text": "Short text question",
        "question_type": "text",
        "config": {
            "optional": False,
            "text_size": "medium",
            "placeholder": "Type your answer...",
            "title_alignment": "inherit",
            "action_alignment": "left"
        },
        "position":      9,
        "is_numeric":    False,
    },
]


# ── Text pools for text/long_text questions ───────────────────────────────────
LONG_TEXT_POOL = [
    # positive
    "The venue was absolutely stunning. Every detail was thoughtful and the staff went above and beyond.",
    "Incredible experience from start to finish. The ambiance was perfect and the service was exceptional.",
    "We had a wonderful time. Clean, well-organised, and the team was incredibly welcoming.",
    "Outstanding venue. The facilities are modern and the staff are attentive and professional.",
    "Loved every moment of our visit. The venue exceeded all our expectations and we will be back.",
    "Everything was handled perfectly. The food was amazing and the environment was really comfortable.",
    "A truly memorable experience. Highly recommend this venue to anyone looking for quality.",
    # negative
    "Quite disappointed with the experience. The service was slow and the facilities felt neglected.",
    "Not what we expected at all. Several things went wrong and the staff seemed indifferent.",
    "The venue was overcrowded and the noise level made it very difficult to enjoy ourselves.",
    "Poor value for money. The quality did not match the price and we left feeling let down.",
    "Unfortunately a very average experience. The staff were unhelpful and the wait times excessive.",
    "The cleanliness left a lot to be desired. Would not recommend this venue to others.",
    "Very underwhelming. Multiple issues throughout the visit and no attempt to address them.",
    # neutral
    "An okay experience overall. Some things were good but others could use improvement.",
    "The venue was fine for what we needed. Nothing stood out particularly positively or negatively.",
    "Average. The service was decent but the facilities are showing their age.",
    "A reasonable experience. Met expectations but did not exceed them in any way.",
    "Neither great nor terrible. A solid but unremarkable visit.",
    "The experience was mixed. Some aspects were good while others fell short.",
]

SHORT_TEXT_POOL = [
    # positive
    "Great service!",
    "Really happy with my visit.",
    "Loved it, will definitely return.",
    "Excellent experience overall.",
    "Very impressed, highly recommended.",
    "Fantastic, exceeded expectations.",
    "Absolutely brilliant, thank you!",
    # negative
    "Not happy with the service.",
    "Quite disappointing, won't return.",
    "Poor experience overall.",
    "Left feeling let down.",
    "Would not recommend.",
    "Staff were rude and unhelpful.",
    "Very underwhelming visit.",
    # neutral
    "It was okay.",
    "Average experience.",
    "Nothing special but fine.",
    "Met basic expectations.",
    "Could be better.",
    "Decent but not outstanding.",
]

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

# ── AI prompt template (matches real app format from 02_seed.sql) ─────────────
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

def _sql_escape(s: str) -> str:
    """Escape a Python string for embedding in a SQL single-quoted literal."""
    return s.replace("'", "''")


def _fmt_ts(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f")


def _fmt_tstz(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f+00")


def _sql_jsonb(obj) -> str:
    return f"'{_sql_escape(json.dumps(obj, ensure_ascii=False))}'::jsonb"


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


def _generate_answer(q: dict, response_idx: int, photo_urls: list[str]) -> dict:
    """
    Returns a dict:
        answers_value  – value for survey_responses.answers JSONB (None = exclude key)
        text_value     – for survey_response_answers (mutually exclusive with numeric_value)
        numeric_value  – for survey_response_answers (mutually exclusive with text_value)
        photo_url      – URL if photo type, else None
        ai_text        – text for ai_analysis (long_text/text only), else None
    """
    qt = q["question_type"]
    options = ["Option 1", "Option 2", "Option 3", "Option 4"]

    if qt == "checkbox":
        chosen = random.sample(options, k=random.randint(1, 3))
        return dict(
            answers_value=chosen,
            text_value=", ".join(chosen),
            numeric_value=None,
            photo_url=None,
            ai_text=None,
        )

    if qt == "multiple_choice":
        chosen = random.choice(options)
        return dict(
            answers_value=chosen,
            text_value=chosen,
            numeric_value=None,
            photo_url=None,
            ai_text=None,
        )

    if qt == "yes_no":
        chosen = random.choice(["Yes", "No"])
        return dict(
            answers_value=chosen,
            text_value=chosen,
            numeric_value=None,
            photo_url=None,
            ai_text=None,
        )

    if qt == "email":
        val = f"user{response_idx}@example.com"
        return dict(
            answers_value=val,
            text_value=val,
            numeric_value=None,
            photo_url=None,
            ai_text=None,
        )

    if qt == "phone":
        digits = "".join(str(random.randint(0, 9)) for _ in range(9))
        val = f"+61 4{digits[0:2]} {digits[2:5]} {digits[5:9]}"
        return dict(
            answers_value=val,
            text_value=val,
            numeric_value=None,
            photo_url=None,
            ai_text=None,
        )

    if qt == "photo":
        url = random.choice(photo_urls) if photo_urls else "https://placehold.co/800x600.jpg"
        return dict(
            answers_value=None,  # photo key excluded from answers JSONB
            text_value=None,
            numeric_value=None,
            photo_url=url,
            ai_text=None,
        )

    if qt == "nps":
        val = random.randint(0, 10)
        return dict(
            answers_value=val,
            text_value=None,
            numeric_value=val,
            photo_url=None,
            ai_text=None,
        )

    if qt == "star":
        val = random.randint(1, 5)
        return dict(
            answers_value=val,
            text_value=None,
            numeric_value=val,
            photo_url=None,
            ai_text=None,
        )

    if qt == "long_text":
        text = random.choice(LONG_TEXT_POOL)
        return dict(
            answers_value=text,
            text_value=text,
            numeric_value=None,
            photo_url=None,
            ai_text=text,
        )

    if qt == "text":
        text = random.choice(SHORT_TEXT_POOL)
        return dict(
            answers_value=text,
            text_value=text,
            numeric_value=None,
            photo_url=None,
            ai_text=text,
        )

    raise ValueError(f"Unknown question type: {qt}")


# ── SQL statement builders ────────────────────────────────────────────────────

def _questions_bootstrap_sql() -> list[str]:
    lines = [
        "-- ── Questions bootstrap (idempotent) ──────────────────────────────────────",
    ]
    for q in QUESTIONS:
        is_num = "TRUE" if q["is_numeric"] else "FALSE"
        lines.append(
            f"INSERT INTO questions "
            f"(id, stable_question_id, survey_version_id, question_key, question_text, "
            f"question_type, config, position, is_numeric, deleted_at) VALUES ("
            f"'{q['q_id']}', "
            f"'{q['stable_q_id']}', "
            f"'{SURVEY_VERSION_ID}', "
            f"'{q['question_key']}', "
            f"'{_sql_escape(q['question_text'])}', "
            f"'{q['question_type']}', "
            f"{_sql_jsonb(q['config'])}, "
            f"{q['position']}, "
            f"{is_num}, "
            f"NULL"
            f") ON CONFLICT (id) DO NOTHING;"
        )
    return lines


def _sra_insert(
    sra_id: str,
    resp_id: str,
    stable_q_id: str,
    text_val: str | None,
    num_val: int | float | None,
    created_at: datetime,
) -> str:
    """Build an INSERT for survey_response_answers respecting the CHECK constraint."""
    if text_val is not None:
        return (
            f"INSERT INTO survey_response_answers "
            f"(id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ("
            f"'{sra_id}', '{resp_id}', '{stable_q_id}', "
            f"'{_sql_escape(text_val)}', NULL, '{_fmt_ts(created_at)}', NULL);"
        )
    return (
        f"INSERT INTO survey_response_answers "
        f"(id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ("
        f"'{sra_id}', '{resp_id}', '{stable_q_id}', "
        f"NULL, {num_val}, '{_fmt_ts(created_at)}', NULL);"
    )


def _response_sql(
    response_idx: int,
    start_date: datetime,
    end_date: datetime,
    photo_urls: list[str],
) -> list[str]:
    """Generate all SQL INSERTs for a single survey response lifecycle."""
    lines: list[str] = [
        f"-- ── Response {response_idx + 1} ─────────────────────────────────────────────────────",
    ]

    # Timestamps
    scan_ts = _random_datetime(start_date, end_date)
    time_taken_secs = random.randint(20, 180)
    end_ts = scan_ts + timedelta(seconds=time_taken_secs)

    # Network / device
    ip = _random_ip()
    hashed_ip = _hash_ip(ip)
    ua_str, device_type, browser = random.choice(USER_AGENTS)

    # Fresh UUIDs for this response
    snap_id    = str(uuid.uuid4())
    scan_id    = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    resp_id    = str(uuid.uuid4())


    location_id = random.choice(list(LOCATION_QR_CODE_MAP.keys()))
    location_name = (LOCATION_QR_CODE_MAP.get(location_id)).get("location_name")
    qr_code_id = (LOCATION_QR_CODE_MAP.get(location_id)).get("qr_code_id")

    # 1. location_snapshots
    lines.append(
        f"INSERT INTO location_snapshots "
        f"(id, location_id, name, state, country, created_at, deleted_at) VALUES ("
        f"'{snap_id}', '{location_id}', '{location_name}', NULL, NULL, "
        f"'{_fmt_ts(scan_ts)}', NULL);"
    )

    # 2. scan_events
    lines.append(
        f"INSERT INTO scan_events "
        f"(id, qr_code_id, company_id, location_snapshot_id, scanned_at, "
        f"ip_address, user_agent, session_id, deleted_at) VALUES ("
        f"'{scan_id}', '{qr_code_id}', '{COMPANY_ID}', '{snap_id}', "
        f"'{_fmt_ts(scan_ts)}', '{ip}', '{_sql_escape(ua_str)}', '{session_id}', NULL);"
    )

    # 3. survey_sessions
    lines.append(
        f"INSERT INTO survey_sessions "
        f"(id, scan_id, survey_version_id, qr_code_id, company_id, location_snapshot_id, "
        f"start_time, end_time, abandoned, device_type, browser, hashed_ip_address, deleted_at) VALUES ("
        f"'{session_id}', '{scan_id}', '{SURVEY_VERSION_ID}', '{qr_code_id}', "
        f"'{COMPANY_ID}', '{snap_id}', "
        f"'{_fmt_ts(scan_ts)}', '{_fmt_ts(end_ts)}', FALSE, "
        f"'{device_type}', '{browser}', '{hashed_ip}', NULL);"
    )

    # Collect answers from all questions
    answers_dict: dict = {}
    sra_rows: list[tuple[str, str | None, int | float | None]] = []
    photo_rows: list[tuple[str, str, int]] = []  # (stable_q_id, storage_path, file_size)
    ai_rows: list[tuple[str, str]] = []           # (stable_q_id, text)

    for q in QUESTIONS:
        ans = _generate_answer(q, response_idx, photo_urls)

        # Build answers JSONB (photo excluded)
        if q["question_type"] != "photo" and ans["answers_value"] is not None:
            answers_dict[q["question_key"]] = ans["answers_value"]

        # survey_response_answers
        if ans["text_value"] is not None:
            sra_rows.append((q["stable_q_id"], ans["text_value"], None))
        elif ans["numeric_value"] is not None:
            sra_rows.append((q["stable_q_id"], None, ans["numeric_value"]))

        # Photo: both survey_response_photos + answer row with storage_path
        if ans["photo_url"] is not None:
            storage_path = ans["photo_url"]
            file_size = random.randint(50_000, 800_000)
            photo_rows.append((q["stable_q_id"], storage_path, file_size))
            sra_rows.append((q["stable_q_id"], storage_path, None))

        # AI analysis for text/long_text
        if ans["ai_text"] is not None:
            ai_rows.append((q["stable_q_id"], ans["ai_text"]))

    # 4. survey_responses
    lines.append(
        f"INSERT INTO survey_responses "
        f"(id, survey_version_id, session_id, qr_code_id, location_snapshot_id, "
        f"answers, completion_datetime, time_taken_seconds, "
        f"device_type, browser, hashed_ip_address, deleted_at) VALUES ("
        f"'{resp_id}', '{SURVEY_VERSION_ID}', '{session_id}', '{qr_code_id}', "
        f"'{snap_id}', {_sql_jsonb(answers_dict)}, "
        f"'{_fmt_ts(end_ts)}', {time_taken_secs}, "
        f"'{device_type}', '{browser}', '{hashed_ip}', NULL);"
    )

    # 5. survey_response_answers
    for (stable_q_id, text_val, num_val) in sra_rows:
        lines.append(_sra_insert(str(uuid.uuid4()), resp_id, stable_q_id, text_val, num_val, end_ts))

    # 6. survey_response_photos
    for (stable_q_id, storage_path, file_size) in photo_rows:
        lines.append(
            f"INSERT INTO survey_response_photos "
            f"(id, survey_response_id, question_id, storage_path, mime_type, "
            f"file_size_bytes, created_at) VALUES ("
            f"'{uuid.uuid4()}', '{resp_id}', '{stable_q_id}', "
            f"'{_sql_escape(storage_path)}', 'image/jpeg', {file_size}, "
            f"'{_fmt_tstz(end_ts)}');"
        )

    # 7. ai_analysis
    for (stable_q_id, text) in ai_rows:
        sentiment_label, polarity = _get_sentiment(text)
        score = round(polarity, 4)
        analysis_dict = {"sentiment": sentiment_label, "score": score}
        raw_response_value = json.dumps(json.dumps(analysis_dict))
        full_prompt = _SENTIMENT_PROMPT_PREFIX + text
        processing_ms = random.randint(100, 3000)
        lines.append(
            f"INSERT INTO ai_analysis "
            f"(id, company_id, location_id, survey_response_id, question_id, "
            f"prompt, raw_response, analysis, sentiment, sentiment_score, "
            f"model, model_version, analysis_version, status, processing_time_ms, "
            f"error, created_at, deleted_at) VALUES ("
            f"'{uuid.uuid4()}', '{COMPANY_ID}', '{location_id}', '{resp_id}', '{stable_q_id}', "
            f"'{_sql_escape(full_prompt)}', "
            f"'{_sql_escape(raw_response_value)}', "
            f"{_sql_jsonb(analysis_dict)}, "
            f"'{sentiment_label}', {score}, "
            f"'simulated', NULL, 1, 'completed', {processing_ms}, "
            f"NULL, '{_fmt_ts(end_ts)}', NULL);"
        )

    return lines


# ── Public API ────────────────────────────────────────────────────────────────

def generate_survey_responses(
    num_responses: int,
    start_date: datetime,
    end_date: datetime,
    response_photo_urls: list[str],
    output_file: str = "database/generated_responses.sql",
    seed: int | None = 42,
) -> None:
    """
    Generate SQL INSERT statements for `num_responses` simulated survey submissions.

    Args:
        num_responses:       Number of survey responses to generate.
        start_date:          Earliest possible response datetime.
        end_date:            Latest possible response datetime.
        response_photo_urls: Pool of photo URLs to randomly assign to photo questions.
        output_file:         Path to write the output .sql file.
        seed:                Random seed for reproducibility (None for true randomness).
    """
    if seed is not None:
        random.seed(seed)

    lines: list[str] = [
        "-- ─────────────────────────────────────────────────────────────────────────",
        "-- Generated by generate_seed_data.py",
        f"-- num_responses : {num_responses}",
        f"-- start_date    : {start_date.isoformat()}",
        f"-- end_date      : {end_date.isoformat()}",
        f"-- generated_at  : {datetime.now().isoformat()}",
        f"-- textblob      : {'available' if _TEXTBLOB_AVAILABLE else 'not installed (keyword fallback)'}",
        "-- ─────────────────────────────────────────────────────────────────────────",
        "",
    ]

    lines += _questions_bootstrap_sql()
    lines.append("")

    for i in range(num_responses):
        lines += _response_sql(i, start_date, end_date, response_photo_urls)
        lines.append("")

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Written {num_responses} responses to {output_file}")
    if not _TEXTBLOB_AVAILABLE:
        print("Note: textblob not installed — using keyword-based sentiment fallback.")
        print("      Install with: pip install textblob")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    generate_survey_responses(
        num_responses=1000,
        start_date=datetime(2026, 2, 1),
        end_date=datetime(2026, 3, 29),
        response_photo_urls=[
            "5289959e-513b-4f71-8fa5-ff73bdf20461/4eedd9af-12d5-465b-b8cf-8066dee25ce4.png",
            "9cf65c3b-296e-49e7-a6c1-038d67ee1773/f0de0f8b-bf88-45c4-8d41-8d04757918a6.png",
            "e2921e21-43f2-4ecd-984f-96b1e64fc126/6ecff156-d8c0-4d45-9c8c-17ca4336e3e2.jpg",
        ],
        output_file="database/test_data/04_demo_seed.sql",
    )
