import * as fs from "fs";
import type { VehicleRecord } from "./types.js";

/** Write vehicle records as pretty-printed JSON. */
export function exportJSON(records: VehicleRecord[], filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8");
}