import json
from pathlib import Path
from datetime import datetime, timedelta, timezone

import requests

CACHE_FILE = Path("exchange_rate_cache.json")
CACHE_DURATION = timedelta(hours=6)
EXCHANGE_RATE_URL = "https://api.frankfurter.dev/v1/latest?base=JPY&symbols=AUD"


def load_cached_rate():
    """
    Load cached exchange rate from a JSON file if it exists.
    Returns None if the cache file is missing or invalid.
    """
    if not CACHE_FILE.exists():
        return None

    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as file:
            cache = json.load(file)

        return {
            "rate": float(cache["rate"]),
            "cached_at": datetime.fromisoformat(cache["cached_at"])
        }
    except Exception:
        return None


def save_cached_rate(rate):
    """
    Save exchange rate and current UTC timestamp to a JSON file.
    """
    cache = {
        "rate": rate,
        "cached_at": datetime.now(timezone.utc).isoformat()
    }

    with open(CACHE_FILE, "w", encoding="utf-8") as file:
        json.dump(cache, file, indent=2)


def fetch_jpy_to_aud_rate():
    """
    Fetch the latest JPY to AUD exchange rate from Frankfurter API.
    """
    response = requests.get(EXCHANGE_RATE_URL, timeout=10)
    response.raise_for_status()

    data = response.json()
    return float(data["rates"]["AUD"])


def get_jpy_to_aud_rate():
    """
    Return the exchange rate, using a cached value if it is still fresh.
    If the API fails, fall back to an older cached rate if available.
    """
    cached = load_cached_rate()
    now = datetime.now(timezone.utc)

    if cached is not None:
        cache_age = now - cached["cached_at"]
        if cache_age < CACHE_DURATION:
            print("Using cached JPY to AUD exchange rate.")
            return cached["rate"]

    try:
        print("Fetching new JPY to AUD exchange rate...")
        rate = fetch_jpy_to_aud_rate()
        save_cached_rate(rate)
        return rate
    except Exception as error:
        print(f"Warning: Could not fetch latest exchange rate: {error}")

        if cached is not None:
            print("Using old cached exchange rate instead.")
            return cached["rate"]

        raise RuntimeError("No exchange rate available.")


def convert_jpy_to_aud(jpy_amount):
    """
    Convert JPY into AUD.
    """
    rate = get_jpy_to_aud_rate()
    return round(jpy_amount * rate, 2)
