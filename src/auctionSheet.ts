import { parseMileageToKm } from "./mileage.js";

/** Exterior condition grade descriptions (評価点). */
const EXTERIOR_GRADE_DESCRIPTIONS: Record<string, string> = {
  S: "Showroom condition",
  "5": "As new",
  "4.5": "Very clean",
  "4": "Good condition",
  "3.5": "Average condition",
  "3": "Rough condition",
  "2": "Poor condition",
  R: "Repaired (accident history) — apply a larger value penalty",
  RA: "Lightly repaired — apply a moderate value penalty",
};

/** Interior condition grade descriptions (A–D). */
const INTERIOR_GRADE_DESCRIPTIONS: Record<string, string> = {
  A: "Excellent — clean and fresh, no stains or wear, like new",
  B: "Good — light wear, a few very small marks only",
  C: "Average — noticeable stains, wear or minor damage",
  D: "Poor — heavy staining, torn trim, or a strong smell",
};

export type MileageFlag = "" | "★" | "★★" | "★★★" | "-";

const MILEAGE_FLAG_WARNINGS: Record<MileageFlag, string> = {
  "": "Mileage is considered accurate",
  "★": "Unverifiable — no service record to confirm; accept with caution",
  "★★": "Reading looks too low for the car's condition; treat as unreliable",
  "★★★": "Odometer tampering suspected — avoid, or verify carefully",
  "-": "The meter was replaced; true mileage unknown",
};

/** Ownership-history terms (車歴). */
const OWNERSHIP_HISTORY: Record<string, string> = {
  "自家用": "Private use — one private owner (best)",
  "ワンオーナー": "One owner (best)",
  "リース": "Lease — typically serviced on a strict schedule",
  "社用": "Company/fleet car — maintained but often driven hard",
  "レンタ": "Ex-rental — many drivers, more wear per km; price accordingly",
  "教習車": "Driving school car — extreme clutch/brake wear, avoid",
};

/** Sales points / equipment (セールスポイント). Longer keys are matched first
 *  so e.g. "社外マフラー積込" doesn't get shadowed by "社外マフラー". */
const SALES_POINTS: Record<string, string> = {
  "ユーザー買取車": "Bought directly from the previous owner (not trade stock)",
  "初出品": "First time at auction — has not been through a sale and passed",
  "禁煙車": "Non-smoker car",
  "ルームクリーニング済": "Interior cleaned",
  "ディーラー車": "Dealer-supplied — sold new in Japan by a franchised dealer",
  "整備記録簿": "Service record book",
  "キセノン": "Xenon headlamps",
  "ディスチャージ": "Xenon/HID headlamps",
  "LED": "LED headlamps",
  "フォグ": "Fog lamps",
  "サンルーフ": "Sunroof",
  "ルーフレール": "Roof rails",
  "キャリア": "Roof carrier",
  "エアロパーツ": "Body kit",
  "ブルバー": "Bull bar",
  "カーボンボンネット": "Carbon-fibre bonnet",
  "純正アルミ": "Factory alloy wheels",
  "社外アルミ": "Aftermarket alloy wheels",
  "社外足廻り": "Aftermarket suspension",
  "車高調": "Height-adjustable coilover suspension",
  "ローダウン": "Lowered",
  "リフトアップ": "Lifted / raised",
  "社外マフラー積込": "Aftermarket exhaust carried in the car (not fitted)",
  "社外マフラー": "Aftermarket exhaust",
  "純正マフラー積込": "Factory exhaust carried in the car",
  "社外品有": "Aftermarket parts fitted",
  "Rスポ": "Rear spoiler",
  "背面タイヤ": "Rear-mounted spare wheel (4x4s)",
  "革シート": "Leather seats",
  "本革": "Genuine leather",
  "革調": "Synthetic leather",
  "パワーシート": "Power seats",
  "シートヒーター": "Heated seats",
  "FのみP/W": "Front power windows only",
  "エアB欠": "Without an airbag (aftermarket steering wheel)",
  "社外ハンドル": "Aftermarket steering wheel",
  "ウッドコンビハンドル": "Wood and leather steering wheel",
  "ウッド調パネル": "Wood-look trim",
  "カーボン調パネル": "Carbon-look trim",
  "社外シフトノブ": "Aftermarket gear knob",
  "純正マット": "Factory floor mats",
  "ドアバイザー": "Door visors (wind deflectors)",
  "純正ナビ": "Factory navigation (Japanese maps only)",
  "HDDナビ": "Hard-disk navigation",
  "ナビディスク後日": "Navigation disc to follow",
  "走行中TV OK": "TV works while driving",
  "バックカメラ": "Reversing camera",
  "ドラレコ": "Dash cam",
  "ETC": "Toll transponder (Japan only)",
  "CDチェンジャー": "CD changer",
  "ヘッドレストモニター": "Headrest screens",
  "サンバイザーモニター": "Sun-visor screens",
  "フリップダウンモニター": "Roof-mounted screen",
  "キーレス後日": "Remote key to follow",
  "キーレス": "Keyless entry / remote key",
  "スマートキー": "Smart key / push-button start",
  "社外セキュリティ": "Aftermarket alarm",
  "電格ミラー": "Power-folding mirrors",
  "コーナーセンサー": "Parking sensors",
  "ソナー": "Parking sensors",
  "クルコン": "Cruise control",
  "寒冷地仕様": "Cold-region specification",
};

/** Body-diagram damage codes (車両状態図). */
const BODY_DAMAGE_CODES: Record<string, string> = {
  A: "Scratch",
  U: "Dent",
  "B/AU": "Dent + scratch",
  W: "Repair trace",
  XX: "Replaced",
  X: "Needs replacing",
  P: "Needs repaint",
  S: "Rust",
  C: "Corrosion",
  G: "Glass chip",
  Z: "Broken",
  "歪": "Distortion",
  "ヒズミ": "Distortion",
};

/** Miscellaneous shorthand codes seen on sheets/spec lines. */
const OTHER_CODES: Record<string, string> = {
  AC: "Air conditioner",
  "FA/AT": "Automatic transmission",
  F5: "Manual (5-speed) transmission",
  PS: "Power steering",
  SR: "Sunroof",
  AW: "Alloy wheels",
  AAC: "Climate control air conditioner",
  CA: "Column automatic transmission",
  F6: "Manual (6-speed) transmission",
  PW: "Power windows",
  TV: "Television",
  "カワ・革": "Leather seats",
  "エアB": "Airbag",
  E3: "Some dents which are barely visible",
  Y1: "A tear the size of a thumb",
  Y2: "A tear the size of a palm",
  Y3: "A tear larger than Y2",
};

/** Convert a Japanese-era registration code (e.g. "R5", "H30", "S64") to a Gregorian year. */
export function convertImperialYear(raw?: string): number | null {
  const match = raw?.trim().match(/^([RHS])\s*(\d{1,2})$/i);
  if (!match) return null;
  const base = { R: 2018, H: 1988, S: 1925 }[match[1].toUpperCase() as "R" | "H" | "S"];
  return base + Number(match[2]);
}

/** Translate an exterior grade (評価点) into a plain-English description. */
export function translateExteriorGrade(raw?: string): string | undefined {
  const key = raw?.trim().toUpperCase();
  return key ? EXTERIOR_GRADE_DESCRIPTIONS[key] : undefined;
}

/** Translate an interior grade (A–D) into a plain-English description. */
export function translateInteriorGrade(raw?: string): string | undefined {
  const key = raw?.trim().toUpperCase();
  return key ? INTERIOR_GRADE_DESCRIPTIONS[key] : undefined;
}

function detectMileageFlag(raw: string): MileageFlag {
  if (raw.includes("★★★")) return "★★★";
  if (raw.includes("★★")) return "★★";
  if (raw.includes("★")) return "★";
  const trimmed = raw.trim();
  if (trimmed && /^[-−–—]+$/.test(trimmed)) return "-";
  return "";
}

/** Parse a raw auction-sheet mileage string (number + reliability symbol) into km and a caution flag. */
export function parseAuctionMileage(raw?: string): { km: number | null; flag: MileageFlag; warning: string } {
  const text = raw ?? "";
  const flag = detectMileageFlag(text);
  const km = flag === "-" ? null : parseMileageToKm(text);
  return { km, flag, warning: MILEAGE_FLAG_WARNINGS[flag] };
}

/** Translate a raw ownership-history term (車歴) into plain English. */
export function translateOwnershipHistory(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (OWNERSHIP_HISTORY[trimmed]) return OWNERSHIP_HISTORY[trimmed];
  const match = Object.keys(OWNERSHIP_HISTORY).find((key) => trimmed.includes(key));
  return match ? OWNERSHIP_HISTORY[match] : undefined;
}

/** Find and translate any known sales-point/equipment terms (セールスポイント) inside free text. */
export function extractSalesPoints(raw?: string): { jp: string; en: string }[] {
  const text = raw ?? "";
  if (!text) return [];
  const keys = Object.keys(SALES_POINTS).sort((a, b) => b.length - a.length);
  const found: { jp: string; en: string }[] = [];
  for (const key of keys) {
    if (text.includes(key)) found.push({ jp: key, en: SALES_POINTS[key] });
  }
  return found;
}

/** Translate a single body-diagram damage code (e.g. "A", "XX", "歪"). */
export function translateBodyDamageCode(code: string): string | undefined {
  const trimmed = code.trim();
  return BODY_DAMAGE_CODES[trimmed.toUpperCase()] ?? BODY_DAMAGE_CODES[trimmed];
}

/** Translate a miscellaneous shorthand spec code (e.g. "PS", "F5", "Y2"). */
export function translateOtherCode(code: string): string | undefined {
  const trimmed = code.trim();
  return OTHER_CODES[trimmed.toUpperCase()] ?? OTHER_CODES[trimmed];
}

export interface RawAuctionSheet {
  exteriorGradeRaw?: string;
  interiorGradeRaw?: string;
  mileageRaw?: string;
  ownershipHistoryRaw?: string;
  registrationRaw?: string;
  salesPointsRaw?: string;
  chassisNumberRaw?: string;
  inspectorNotesRaw?: string;
}

export interface TranslatedAuctionSheet {
  exteriorGrade?: string;
  exteriorGradeDescription?: string;
  interiorGrade?: string;
  interiorGradeDescription?: string;
  mileageKm: number | null;
  mileageWarning: string;
  ownershipHistory?: string;
  registrationYear: number | null;
  salesPoints: { jp: string; en: string }[];
  chassisNumber?: string;
  inspectorNotes?: string;
}

/** Translate a full raw Japanese auction sheet into a structured, English-readable summary. */
export function translateAuctionSheet(raw: RawAuctionSheet): TranslatedAuctionSheet {
  const mileage = parseAuctionMileage(raw.mileageRaw);
  return {
    exteriorGrade: raw.exteriorGradeRaw?.trim() || undefined,
    exteriorGradeDescription: translateExteriorGrade(raw.exteriorGradeRaw),
    interiorGrade: raw.interiorGradeRaw?.trim() || undefined,
    interiorGradeDescription: translateInteriorGrade(raw.interiorGradeRaw),
    mileageKm: mileage.km,
    mileageWarning: mileage.warning,
    ownershipHistory: translateOwnershipHistory(raw.ownershipHistoryRaw),
    registrationYear: convertImperialYear(raw.registrationRaw),
    salesPoints: extractSalesPoints(raw.salesPointsRaw),
    chassisNumber: raw.chassisNumberRaw?.trim() || undefined,
    inspectorNotes: raw.inspectorNotesRaw?.trim() || undefined,
  };
}