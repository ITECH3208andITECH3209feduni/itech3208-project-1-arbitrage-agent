/** Extraction prompt — guides LLM to parse Goo-net markdown into VehicleRecord fields. */
export const EXTRACT_PROMPT = `Extract structured vehicle data from each Goo-net listing page in the markdown below.
Pages are separated by --- and each starts with an HTML comment containing the URL: <!-- PAGE: https://... -->.

## Field Mapping Guide (Goo-net → VehicleRecord)

| Japanese Field    | VehicleRecord Field | Notes                                      |
|-------------------|---------------------|--------------------------------------------|
| 車名 / メーカー    | title               | Vehicle name and maker                     |
| 価格              | priceRaw            | Raw string, e.g. "150万円"                 |
| 走行距離           | mileageRaw          | Raw string, e.g. "3.5万km"                |
| 年式              | year                | Numeric year (e.g. 2020)                   |
| 色 / 外装色        | color               | Japanese color name                         |
| シフト            | transmission        | AT / CVT / MT                               |
| 駆動方式           | driveType           | FF / FR / 4WD                               |
| 排気量            | engineSize          | Engine displacement string                  |
| 燃料              | fuelType            | ガソリン / ディーゼル / ハイブリッド etc.       |
| ボディ            | bodyType            | セダン / SUV / ワゴン etc.                   |
| ドア数            | doors               | Numeric                                     |
| 乗車定員           | seats               | Numeric                                     |
| 販売店            | dealer              | Dealer name (keep as-is)                    |
| エリア            | location            | Region/area (keep as-is)                    |
| 車両説明           | description         | Full description text                       |
| 画像              | images              | Array of image URLs                         |

## Rules

- Set price and mileage to null — the normalizer will parse them from priceRaw and mileageRaw.
- Set extractedAt to the current ISO 8601 timestamp.
- If a field is not found on the page, use null for numbers, "" for strings, [] for arrays.
- Use the URL from the <!-- PAGE: ... --> comment for the url field.

## Example Output

{"url":"https://www.goo-net.com/car/spread/goo/1234567890.html","title":"スバル WRX S4 STI Sport","price":null,"priceRaw":"350万円","mileage":null,"mileageRaw":"2.1万km","year":2021,"color":"クリスタルホワイト・パール","transmission":"CVT","driveType":"4WD","engineSize":"1,998cc","fuelType":"ガソリン","bodyType":"セダン","doors":4,"seats":5,"dealer":"スバル信州 新潟中央店","location":"新潟県","description":"STI Sport仕様。ワンオーナー。...","images":["https://img.goo-net.com/001/1234567890_1.jpg","https://img.goo-net.com/001/1234567890_2.jpg"],"extractedAt":"2025-01-15T10:30:00.000Z"}
`;

/** Translation reference — Japanese → English field values. */
export const TRANSLATE_PROMPT = `## Translation Reference

### Colors
| Japanese              | English         |
|-----------------------|-----------------|
| 白 / ホワイト          | White           |
| 黒 / ブラック          | Black           |
| 赤 / レッド            | Red             |
| 青 / ブルー            | Blue            |
| 緑 / グリーン          | Green           |
| シルバー / 銀          | Silver          |
| グレー / 灰            | Gray            |
| 黄 / イエロー          | Yellow          |
| オレンジ              | Orange          |
| 紫 / パープル          | Purple          |
| ブラウン / 茶          | Brown           |
| ピンク               | Pink            |
| ベージュ              | Beige           |
| ゴールド / 金          | Gold            |

Translate color names within compound colors (e.g. "クリスタルホワイト・パール" → "Crystal White Pearl").

### Transmission
| Japanese | English    |
|----------|------------|
| AT       | Automatic  |
| CVT      | CVT        |
| MT       | Manual     |

### Drive Type
| Japanese | English    |
|----------|------------|
| FF       | FWD        |
| FR       | RWD        |
| 4WD      | 4WD/AWD    |

### Fuel Type
| Japanese        | English    |
|-----------------|------------|
| ガソリン         | Gasoline   |
| ディーゼル       | Diesel     |
| ハイブリッド      | Hybrid     |
| 電気 / EV       | Electric   |
| LPG            | LPG        |
| CNG            | CNG        |

### Body Type
| Japanese | English     |
|----------|-------------|
| セダン    | Sedan       |
| SUV      | SUV         |
| ワゴン    | Wagon       |
| ハッチバック | Hatchback  |
| クーペ    | Coupe       |
| コンパクト | Compact     |
| トラック  | Truck       |
| バン      | Van         |
| ミニバン  | Minivan     |
| オープン  | Convertible |
| ピックアップ | Pickup     |

### Description
Translate the full description field to natural English. Keep proper nouns (dealer names, location names, model names) in their original form if not commonly known in English.

### Dealer / Location
Keep dealer and location as-is. These are proper nouns.
`;