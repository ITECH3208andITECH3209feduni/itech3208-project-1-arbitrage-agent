import re

from bs4 import BeautifulSoup

from .utils import clean_text


def get_meta_content(soup, attr_name, attr_value):
    tag = soup.find("meta", attrs={attr_name: attr_value})
    if tag and tag.get("content"):
        return clean_text(tag["content"])
    return None


def extract_title_fields(soup):
    title_tag = clean_text(soup.title.get_text(" ", strip=True)) if soup.title else None

    h1 = None
    h1_node = soup.select_one("h1.copy")
    if h1_node:
        h1 = clean_text(h1_node.get_text(" ", strip=True))

    main_h2 = None
    for h2 in soup.find_all("h2"):
        txt = clean_text(h2.get_text(" ", strip=True))
        if txt:
            main_h2 = txt
            break

    canonical = None
    link = soup.find("link", rel="canonical")
    if link and link.get("href"):
        canonical = clean_text(link["href"])

    return {
        "source": "goo-net",
        "page_title": title_tag,
        "headline": h1,
        "vehicle_summary": main_h2,
        "meta_description_jp": get_meta_content(soup, "name", "description"),
        "og_title_jp": get_meta_content(soup, "property", "og:title"),
        "og_description_jp": get_meta_content(soup, "property", "og:description"),
        "canonical_url": canonical,
        "main_image_url": get_meta_content(soup, "property", "og:image"),
    }


def parse_subdata_block(soup):
    result = {}
    ul = soup.select_one("ul.subData")
    if not ul:
        return result

    mapping = {
        "mode": "model_year",
        "mile": "mileage",
        "vehi": "inspection",
        "repa": "repair_history",
        "engi": "engine_displacement",
        "color": "body_color",
    }

    for li in ul.find_all("li", recursive=False):
        classes = li.get("class", [])
        if not classes:
            continue

        out_key = mapping.get(classes[0])
        if not out_key:
            continue

        spans = li.find_all("span", recursive=False)
        if len(spans) >= 2:
            result[out_key] = clean_text(spans[1].get_text(" ", strip=True))

    return result


def extract_price_info(soup):
    result = {
        "total_price_jpy_manen": None,
        "base_price_jpy_manen": None,
    }

    price_blocks = soup.find_all("dl", class_=lambda c: c and "price" in c)

    for dl in price_blocks:
        dt = dl.find("dt")
        dd = dl.find("dd")

        label = clean_text(dt.get_text(" ", strip=True)) if dt else None
        value = clean_text(dd.get_text(" ", strip=True)) if dd else None

        if not label or not value:
            continue

        if result["total_price_jpy_manen"] is None and "支払総額" in label:
            result["total_price_jpy_manen"] = value
        elif result["base_price_jpy_manen"] is None and "車両本体価格" in label:
            result["base_price_jpy_manen"] = value

        if result["total_price_jpy_manen"] and result["base_price_jpy_manen"]:
            break

    return result


def extract_dealer_info(soup):
    result = {
        "dealer_section_text_en": None,
        "dealer_name_en": None,
        "dealer_name_jp": None,
        "dealer_address_en": None,
        "dealer_address_jp": None,
        "dealer_tel": None,
        "dealer_fax": None,
        "business_hours_en": None,
        "business_hours_jp": None,
        "closed_days_en": None,
        "closed_days_jp": None,
    }

    shop = soup.select_one("#shopInfo")
    if not shop:
        return result

    name_node = shop.select_one("#shopInfoDetail .head h3 a") or shop.select_one("#shopInfoDetail .head h3")
    if name_node:
        result["dealer_name_jp"] = clean_text(name_node.get_text(" ", strip=True))

    table = shop.select_one("#shopInfoDetail table")
    if not table:
        return result

    label_map = {}
    for row in table.select("tr"):
        th = row.find("th")
        td = row.find("td")
        if not th or not td:
            continue

        label = clean_text(th.get_text(" ", strip=True))
        value = clean_text(td.get_text(" ", strip=True))
        if label and value:
            label_map[label] = value

    result["dealer_address_jp"] = label_map.get("住所") or label_map.get("address")
    result["dealer_tel"] = label_map.get("TEL") or label_map.get("電話番号")
    result["dealer_fax"] = label_map.get("FAX")
    result["business_hours_jp"] = label_map.get("営業時間") or label_map.get("Business Hours")
    result["closed_days_jp"] = label_map.get("定休日") or label_map.get("Closed on")

    # temporary mirrors before translation
    result["dealer_address_en"] = result["dealer_address_jp"]
    result["business_hours_en"] = result["business_hours_jp"]
    result["closed_days_en"] = result["closed_days_jp"]

    compact_parts = []
    if result["dealer_name_jp"]:
        compact_parts.append(f"Dealer: {result['dealer_name_jp']}")
    if result["dealer_address_jp"]:
        compact_parts.append(f"Address: {result['dealer_address_jp']}")
    if result["dealer_tel"]:
        compact_parts.append(f"TEL: {result['dealer_tel']}")
    if result["business_hours_jp"]:
        compact_parts.append(f"Hours: {result['business_hours_jp']}")
    if result["closed_days_jp"]:
        compact_parts.append(f"Closed: {result['closed_days_jp']}")

    if compact_parts:
        result["dealer_section_text_en"] = " | ".join(compact_parts)

    return result


def extract_js_comments(html: str):
    comments = []

    patterns = [
        r"images_moive_campaign_comment\[\d+\]\s*=\s*'([^']*)'",
        r"comment_arr\[\d+\]\s*=\s*'([^']*)'",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, html)
        for match in matches:
            text = clean_text(match)
            if text and text != "〇":
                comments.append(text)

    seen = set()
    deduped = []
    for c in comments:
        if c not in seen:
            seen.add(c)
            deduped.append(c)

    return deduped


def parse_goonet_detail_page(html: str):
    soup = BeautifulSoup(html, "html.parser")

    result = {}
    result.update(extract_title_fields(soup))
    result.update(parse_subdata_block(soup))
    result.update(extract_price_info(soup))
    result.update(extract_dealer_info(soup))
    result["gallery_comments_jp"] = extract_js_comments(html)

    return result