"""
tests/test_rescrape.py

Unit tests for rescrape_listing() and resolve_listing_url().
Run with: pytest tests/test_rescrape.py -v
"""

import pytest
from unittest.mock import MagicMock, patch

# Adjust this import to wherever your package root is
from goonet_agent.pipeline import resolve_listing_url, rescrape_listing

# ── resolve_listing_url ──────────────────────────────────────────────────────

FULL_URL = (
    "https://www.goo-net.com/usedcar/spread/goo/10/700030247130260401001.html"
)
NUMERIC_ID = "700030247130260401001"
PARTIAL_PATH = "/usedcar/spread/goo/10/700030247130260401001.html"


class TestResolveListingUrl:
    def test_full_url_passes_through(self):
        assert resolve_listing_url(FULL_URL) == FULL_URL

    def test_full_url_strips_whitespace(self):
        result = resolve_listing_url(f"  {FULL_URL}  ")
        assert "goo-net.com" in result

    def test_bare_numeric_id_builds_url(self):
        result = resolve_listing_url(NUMERIC_ID)
        assert result == FULL_URL

    def test_partial_path_builds_url(self):
        result = resolve_listing_url(PARTIAL_PATH)
        assert result == FULL_URL

    def test_raises_for_brand_page_url(self):
        with pytest.raises(ValueError, match="valid Goo-net listing"):
            resolve_listing_url("https://www.goo-net.com/usedcar/brand-TOYOTA/")

    def test_raises_for_short_number(self):
        """Short numbers are not listing IDs."""
        with pytest.raises(ValueError):
            resolve_listing_url("12345")

    def test_raises_for_arbitrary_string(self):
        with pytest.raises(ValueError):
            resolve_listing_url("not-a-url-or-id")


# ── rescrape_listing ─────────────────────────────────────────────────────────

_PARSED = {
    "source": "goo-net",
    "page_title": "トヨタ ８６ ＧＴリミテッド",
    "headline": "トヨタ ８６",
    "vehicle_summary": "GT Limited 6AT",
    "meta_description_jp": None,
    "og_title_jp": None,
    "og_description_jp": None,
    "canonical_url": FULL_URL,
    "main_image_url": "https://img.example.com/1.jpg",
    "model_year": "2019 (令和1)年",
    "mileage": "3.5 万km",
    "inspection": "2026 (令和8)年10月",
    "repair_history": "あり",
    "engine_displacement": "2000cc",
    "body_color": "アズライトブルー",
    "total_price_jpy_manen": "112.8 万円",
    "base_price_jpy_manen": "100 万円",
    "dealer_section_text_en": None,
    "dealer_name_en": None,
    "dealer_name_jp": "（株）四輪館 新川店",
    "dealer_address_en": None,
    "dealer_address_jp": "〒001-0924 北海道札幌市北区新川４条４丁目３−２１",
    "dealer_tel": "0078-6048-7372",
    "dealer_fax": None,
    "business_hours_en": None,
    "business_hours_jp": "朝9：00から夜18：30まで",
    "closed_days_en": None,
    "closed_days_jp": "毎週月曜日・火曜日",
    "gallery_comments_jp": ["ＧＴリミテッド！"],
}


@pytest.fixture()
def mock_run_agent():
    """
    Patch the internal run_goonet_agent so rescrape_listing never touches
    the network.  Returns the mock so individual tests can override it.
    """
    with patch(
        "goonet_agent.pipeline.run_goonet_agent",
        return_value=dict(_PARSED),
    ) as mock:
        yield mock


class TestRescrapeListing:
    def test_returns_dict_with_expected_keys(self, mock_run_agent):
        result = rescrape_listing(NUMERIC_ID)
        assert isinstance(result, dict)
        assert "rescrape_url" in result
        assert "total_price_jpy" in result  # added by normalizer

    def test_rescrape_url_is_canonical(self, mock_run_agent):
        result = rescrape_listing(NUMERIC_ID)
        assert result["rescrape_url"] == FULL_URL

    def test_passes_full_url_to_agent(self, mock_run_agent):
        rescrape_listing(NUMERIC_ID)
        mock_run_agent.assert_called_once_with(
            source=FULL_URL,
            is_url=True,
            translate=False,
            normalize=True,
        )

    def test_accepts_full_url(self, mock_run_agent):
        result = rescrape_listing(FULL_URL)
        assert result["rescrape_url"] == FULL_URL

    def test_accepts_partial_path(self, mock_run_agent):
        result = rescrape_listing(PARTIAL_PATH)
        assert result["rescrape_url"] == FULL_URL

    def test_translate_flag_forwarded(self, mock_run_agent):
        rescrape_listing(NUMERIC_ID, translate=True)
        mock_run_agent.assert_called_once_with(
            source=FULL_URL,
            is_url=True,
            translate=True,
            normalize=True,
        )

    def test_prices_are_normalized_to_int(self, mock_run_agent):
        result = rescrape_listing(NUMERIC_ID)
        assert result["total_price_jpy"] == 1_128_000
        assert result["base_price_jpy"] == 1_000_000

    def test_mileage_is_normalized_to_km(self, mock_run_agent):
        result = rescrape_listing(NUMERIC_ID)
        assert result["mileage_km"] == 35_000

    def test_raises_for_invalid_id(self):
        with pytest.raises(ValueError, match="Cannot resolve"):
            rescrape_listing("not-an-id")

    def test_propagates_network_error(self):
        with patch(
            "goonet_agent.pipeline.run_goonet_agent",
            side_effect=ConnectionError("timeout"),
        ):
            with pytest.raises(ConnectionError):
                rescrape_listing(NUMERIC_ID)
