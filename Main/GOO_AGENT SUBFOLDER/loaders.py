from pathlib import Path

import requests

from .config import HEADERS, DEFAULT_TIMEOUT


def load_html_from_file(file_path: str) -> str:
    raw = Path(file_path).read_bytes()
    return raw.decode("euc_jp", errors="ignore")


def fetch_html_from_url(url: str, timeout: int = DEFAULT_TIMEOUT) -> str:
    response = requests.get(url, headers=HEADERS, timeout=timeout)
    response.raise_for_status()

    if not response.encoding or response.encoding.lower() == "iso-8859-1":
        response.encoding = response.apparent_encoding or "utf-8"

    return response.text


def load_html(source: str, is_url: bool = True) -> str:
    return fetch_html_from_url(source) if is_url else load_html_from_file(source)