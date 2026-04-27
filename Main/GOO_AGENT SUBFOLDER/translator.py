import json
import time

from .config import has_gemini_key


def _call_gemini_with_retry(prompt, model="gemini-3-flash-preview", max_retries=3, sleep_seconds=5):
    if not has_gemini_key():
        raise RuntimeError("GEMINI_API_KEY is not set.")

    from google import genai

    client = genai.Client()
    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
            )
            return response.text.strip()
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                time.sleep(sleep_seconds * attempt)
            else:
                raise last_error


def translate_scalar_fields_with_gemini(data):
    """
    Translate selected scalar Japanese fields into English.
    Keeps original fields untouched and returns *_en additions.
    """

    field_map = {
        "page_title": data.get("page_title"),
        "headline": data.get("headline"),
        "vehicle_summary": data.get("vehicle_summary"),

        "meta_description_jp": data.get("meta_description_jp"),
        "og_title_jp": data.get("og_title_jp"),
        "og_description_jp": data.get("og_description_jp"),

        "model_year": data.get("model_year"),
        "inspection": data.get("inspection"),
        "repair_history": data.get("repair_history"),
        "body_color": data.get("body_color"),
        "engine_displacement": data.get("engine_displacement"),

        "dealer_name_jp": data.get("dealer_name_jp"),
        "dealer_address_jp": data.get("dealer_address_jp"),
        "business_hours_jp": data.get("business_hours_jp"),
        "closed_days_jp": data.get("closed_days_jp"),
    }

    payload = {k: v for k, v in field_map.items() if v}
    if not payload:
        return {}

    prompt = f"""
You are translating structured fields from a Japanese used-car listing into English.

Return ONLY valid JSON with the SAME keys translated into concise natural English.

Rules:
- Preserve proper nouns and model names sensibly.
- Translate short labels like なし into plain English like "none".
- Keep dates natural in English.
- Keep addresses readable in English.
- Keep engine displacement concise, e.g. "2000cc" can remain "2000cc".
- Do not add extra keys.
- Do not explain anything.

Input JSON:
{json.dumps(payload, ensure_ascii=False, indent=2)}
"""

    text = _call_gemini_with_retry(prompt)
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    translated = json.loads(text)

    out = {}

    # existing
    if "page_title" in translated:
        out["page_title_en"] = translated["page_title"]
    if "headline" in translated:
        out["headline_en"] = translated["headline"]
    if "vehicle_summary" in translated:
        out["vehicle_summary_en"] = translated["vehicle_summary"]
    if "body_color" in translated:
        out["body_color_en"] = translated["body_color"]
    if "repair_history" in translated:
        out["repair_history_en"] = translated["repair_history"]

    # newly added
    if "meta_description_jp" in translated:
        out["meta_description_en"] = translated["meta_description_jp"]
    if "og_title_jp" in translated:
        out["og_title_en"] = translated["og_title_jp"]
    if "og_description_jp" in translated:
        out["og_description_en"] = translated["og_description_jp"]
    if "model_year" in translated:
        out["model_year_en"] = translated["model_year"]
    if "inspection" in translated:
        out["inspection_en"] = translated["inspection"]
    if "engine_displacement" in translated:
        out["engine_displacement_en"] = translated["engine_displacement"]

    if "dealer_name_jp" in translated:
        out["dealer_name_en"] = translated["dealer_name_jp"]
    if "dealer_address_jp" in translated:
        out["dealer_address_en"] = translated["dealer_address_jp"]
    if "business_hours_jp" in translated:
        out["business_hours_en"] = translated["business_hours_jp"]
    if "closed_days_jp" in translated:
        out["closed_days_en"] = translated["closed_days_jp"]

    return out


def translate_comments_with_gemini(comments):
    if not comments:
        return []

    prompt = f"""
You are translating Japanese used-car listing comments into concise English.

Return ONLY valid JSON as a list of objects:
[
  {{
    "jp": "...",
    "en": "...",
    "category": "feature|condition|dealer_claim|warranty|other"
  }}
]

Japanese comments:
{json.dumps(comments, ensure_ascii=False, indent=2)}
"""

    text = _call_gemini_with_retry(prompt)
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(text)


def translate_all_japanese_fields(data):
    data.update(translate_scalar_fields_with_gemini(data))

    comments_jp = data.get("gallery_comments_jp", [])
    if comments_jp:
        data["gallery_comments_translated"] = translate_comments_with_gemini(comments_jp)

    return data