import re


def parse_japanese_price_to_yen(price_text):
    if not price_text:
        return None
    m = re.search(r"([\d\.]+)\s*万円", price_text)
    if not m:
        return None
    return int(float(m.group(1)) * 10000)


def parse_japanese_mileage_to_km(mileage_text):
    if not mileage_text:
        return None

    text = mileage_text.replace(",", "").strip()

    m = re.search(r"([\d\.]+)\s*万km", text)
    if m:
        return int(float(m.group(1)) * 10000)

    m = re.search(r"(\d+)\s*km", text, re.IGNORECASE)
    if m:
        return int(m.group(1))

    return None


def build_rich_final_record(data):
    """
    Keep original + translated fields and add numeric normalization.
    """
    result = dict(data)
    result["mileage_km"] = parse_japanese_mileage_to_km(data.get("mileage"))
    result["total_price_jpy"] = parse_japanese_price_to_yen(data.get("total_price_jpy_manen"))
    result["base_price_jpy"] = parse_japanese_price_to_yen(data.get("base_price_jpy_manen"))
    return result