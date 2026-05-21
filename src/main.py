from currency_converter import get_jpy_to_aud_rate
from time_utils import get_time_remaining
from distance_utils import normalize_mileage_to_km

vehicles = [
    {
        "make": "Toyota",
        "model": "Alphard",
        "auction_price_jpy": 2400000,
        "mileage_value": 68500,
        "mileage_unit": "km",
        "auction_end_time": "2026-05-20T10:00:00+00:00"
    },
    {
        "make": "Nissan",
        "model": "Skyline",
        "auction_price_jpy": 1800000,
        "mileage_value": 42000,
        "mileage_unit": "mi",
        "auction_end_time": "2026-05-20T18:00:00+00:00"
    },
    {
        "make": "Mazda",
        "model": "CX-5",
        "auction_price_jpy": 1500000,
        "mileage_value": 91000,
        "mileage_unit": "km",
        "auction_end_time": "2026-05-21T08:30:00+00:00"
    }
]

"""
Takes a list of vehicles and adds other useful data re: vehicle.
"""
def enrich_vehicle_data(vehicle_list):
    """
    Add converted price, mileage in km, and auction countdown data.
    """
    rate = get_jpy_to_aud_rate()

    for vehicle in vehicle_list:
        vehicle["exchange_rate_used"] = rate
        vehicle["auction_price_aud"] = round(vehicle["auction_price_jpy"] * rate, 2)

        vehicle["mileage_km"] = normalize_mileage_to_km(
            vehicle["mileage_value"],
            vehicle["mileage_unit"]
        )

        time_remaining = get_time_remaining(vehicle["auction_end_time"])
        vehicle["auction_status"] = time_remaining["status"]
        vehicle["seconds_left"] = time_remaining["seconds_left"]
        vehicle["time_left"] = time_remaining["display"]

    return vehicle_list


def display_vehicles(vehicle_list):
    """
    Print the vehicle data to Terminal in a readable format.
    """
    print("\nVehicle Auction Dashboard\n")
    print("-" * 110)

    for vehicle in vehicle_list:
        status_label = "EXPIRED" if vehicle["auction_status"] == "expired" else vehicle["time_left"]

        print(
            f"{vehicle['make']} {vehicle['model']} | "
            f"JPY ¥{vehicle['auction_price_jpy']:,} | "
            f"AUD ${vehicle['auction_price_aud']:,.2f} | "
            f"Mileage: {vehicle['mileage_km']:,.2f} km | "
            f"Time Left: {status_label} | "
            f"Rate: {vehicle['exchange_rate_used']:.6f}"
        )

    print("-" * 110)


if __name__ == "__main__":
    enriched_vehicles = enrich_vehicle_data(vehicles)

    enriched_vehicles.sort(
        key=lambda vehicle: (
            vehicle["auction_status"] == "expired",
            vehicle["seconds_left"]
        )
    )

    display_vehicles(enriched_vehicles)
