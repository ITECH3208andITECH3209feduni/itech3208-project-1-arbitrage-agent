/** A single extracted and normalized vehicle listing from Goo-net. */
export interface VehicleRecord {
  /** Source listing URL. */
  url: string;
  /** Translated listing title in English. */
  title: string;
  /** Raw listing title in Japanese. */
  titleRaw: string;
  /** Parsed price in JPY, or null if unavailable. */
  price: number | null;
  /** Raw price string as shown on the listing page. */
  priceRaw: string;
  /** Parsed mileage in km, or null if unavailable. */
  mileage: number | null;
  /** Raw mileage string as shown on the listing page. */
  mileageRaw: string;
  /** Model year (e.g. 2020), or null if not detected. */
  year: number | null;
  /** Translated color in English. */
  color: string;
  /** Raw color in Japanese. */
  colorRaw: string;
  /** Translated transmission type (e.g. "Automatic", "CVT", "Manual"). */
  transmission: string;
  /** Raw transmission type in Japanese. */
  transmissionRaw: string;
  /** Translated drive type (e.g. "FWD", "RWD", "4WD/AWD"). */
  driveType: string;
  /** Raw drive type in Japanese. */
  driveTypeRaw: string;
  /** Engine displacement (e.g. "3.5L"). */
  engineSize: string;
  /** Translated fuel type (e.g. "Gasoline", "Hybrid"). */
  fuelType: string;
  /** Raw fuel type in Japanese. */
  fuelTypeRaw: string;
  /** Translated body type (e.g. "Sedan", "SUV"). */
  bodyType: string;
  /** Raw body type in Japanese. */
  bodyTypeRaw: string;
  /** Number of doors, or null if not detected. */
  doors: number | null;
  /** Number of seats, or null if not detected. */
  seats: number | null;
  /** Raw dealer name in Japanese (as shown on listing). */
  dealerRaw: string;
  /** Translated dealer name in English. */
  dealer: string;
  /** Raw location / prefecture in Japanese. */
  locationRaw: string;
  /** Translated location in English. */
  location: string;
  /** Translated description in English. */
  description: string;
  /** Raw description in Japanese. */
  descriptionRaw: string;
  /** URLs of listing images. */
  images: string[];
  /** ISO-8601 timestamp of when the record was extracted. */
  extractedAt: string;
}

/** Configuration for a {@link crawl} run. */
export interface CrawlConfig {
  /** Brand / model search term (e.g. "Toyota Alphard"). */
  brand?: string;
  /** Direct brand page URL — overrides `brand` for discovery. */
  brandUrl?: string;
  /** Maximum number of listings to process (default: 10). */
  max: number;
  /** Output directory for exported files (default: `"./data"`). */
  outDir: string;
}

/** Summary returned after a {@link crawl} run completes. */
export interface CrawlResult {
  /** Total URLs discovered during the discovery phase. */
  totalFound: number;
  /** Number of listings successfully extracted and normalized. */
  totalExtracted: number;
  /** Number of listings that failed during fetch or extraction. */
  totalFailed: number;
  /** Extracted vehicle records. */
  records: VehicleRecord[];
  /** Directory where exported files were written. */
  outputPath: string;
}
