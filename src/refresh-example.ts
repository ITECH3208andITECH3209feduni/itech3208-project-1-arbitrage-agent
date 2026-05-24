import "dotenv/config";
import { refreshListing } from "./refreshListing.js";

const result = await refreshListing("700030247130260401001");

if (result.record) {
  console.log(result.record.title, result.record.price);
} else {
  console.error("Failed:", result.error);
}