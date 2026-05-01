import re
from urllib.parse import urlparse, urlunparse


def clean_text(text):
    if not text:
        return None
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url)
    cleaned = parsed._replace(fragment="")
    return urlunparse(cleaned)


def is_same_goonet_domain(url: str) -> bool:
    netloc = urlparse(url).netloc.lower()
    return netloc in {"www.goo-net.com", "goo-net.com"}


def get_brand_slug_from_seed(seed_url: str) -> str:
    """
    Example:
    https://www.goo-net.com/usedcar/brand-LEXUS/ -> LEXUS
    """
    path = urlparse(seed_url).path
    m = re.search(r"/usedcar/brand-([A-Z0-9_]+)/?", path)
    if not m:
        raise ValueError(f"Could not extract brand slug from seed URL: {seed_url}")
    return m.group(1)