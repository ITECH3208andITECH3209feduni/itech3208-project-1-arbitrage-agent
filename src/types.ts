/** A single extracted and normalized vehicle listing from Goo-net. */
export interface VehicleRecord {
  /** Source listing URL. */
  url: string;
  /** Listing title (e.g. "トヨタ アルファード 3.5 SC Package"). */
  title: string;
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
  /** Exterior color. */
  color: string;
  /** Transmission type (e.g. "AT", "CVT", "MT"). */
  transmission: string;
  /** Drive type (e.g. "4WD", "FF", "FR"). */
  driveType: string;
  /** Engine displacement (e.g. "3.5L"). */
  engineSize: string;
  /** Fuel type (e.g. "ガソリン", "ハイブリッド"). */
  fuelType: string;
  /** Body type (e.g. "SUV", "ワンボックス"). */
  bodyType: string;
  /** Number of doors, or null if not detected. */
  doors: number | null;
  /** Number of seats, or null if not detected. */
  seats: number | null;
  /** Dealer name. */
  dealer: string;
  /** Dealer location / prefecture. */
  location: string;
  /** Free-text description from the listing. */
  description: string;
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
