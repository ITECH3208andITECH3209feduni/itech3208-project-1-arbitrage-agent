import os

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    "Referer": "https://www.goo-net.com/",
}

DEFAULT_SLEEP_SECONDS = 1.0
DEFAULT_TIMEOUT = 30

GEMINI_ENV_VAR = "GEMINI_API_KEY"


def has_gemini_key() -> bool:
    return bool(os.environ.get(GEMINI_ENV_VAR))