/** Extraction prompt — guides LLM to parse Goo-net markdown into VehicleRecord fields. */
export const EXTRACT_PROMPT = `Extract structured vehicle data from each Goo-net listing page in the markdown below.
Pages are separated by --- and each starts with an HTML comment containing the URL: <!-- PAGE: https://... -->.

## Field Mapping Guide (Goo-net → VehicleRecord)

For every translatable field, extract both the raw Japanese value (*Raw field) AND translate it to English (non-Raw field).

| Japanese Field    | Raw Field (JP)   | Translated Field (EN) | Notes                                    |
|-------------------|------------------|----------------------|------------------------------------------|
| 車名 / メーカー    | titleRaw         | title                | Raw JP title → English title            |
| 価格              | priceRaw         | —                    | Raw string, e.g. "150万円"              |
| 走行距離           | mileageRaw       | —                    | Raw string, e.g. "3.5万km"             |
| 年式              | year             | —                    | Numeric year (e.g. 2020)                |
| 色 / 外装色        | colorRaw         | color                | Raw JP color → English color            |
| シフト            | transmissionRaw  | transmission         | Raw JP → English                        |
| 駆動方式           | driveTypeRaw     | driveType            | Raw JP → English                        |
| 排気量            | engineSize       | —                    | Engine displacement string              |
| 燃料              | fuelTypeRaw      | fuelType             | Raw JP → English                        |
| ボディ            | bodyTypeRaw      | bodyType             | Raw JP → English                        |
| ドア数            | doors            | —                    | Numeric                                  |
| 乗車定員           | seats            | —                    | Numeric                                  |
| 販売店            | dealerRaw        | dealer               | Raw JP → English                        |
| エリア            | locationRaw      | location             | Raw JP → English                        |
| 車両説明           | descriptionRaw   | description          | Raw JP description → English            |
| 画像              | images           | —                    | Array of image URLs                      |

## Rules

- Set price and mileage to null — the normalizer will parse them from priceRaw and mileageRaw.
- Set extractedAt to the current ISO 8601 timestamp.
- If a field is not found on the page, use null for numbers, "" for strings, [] for arrays.
- Use the URL from the <!-- PAGE: ... --> comment for the url field.
- ALL translatable fields MUST have both the raw Japanese version AND the English translation.

## Example Output

{"url":"https://www.goo-net.com/car/spread/goo/1234567890.html","title":"Subaru WRX S4 STI Sport","titleRaw":"スバル WRX S4 STI Sport","price":null,"priceRaw":"350万円","mileage":null,"mileageRaw":"2.1万km","year":2021,"color":"Crystal White Pearl","colorRaw":"クリスタルホワイト・パール","transmission":"CVT","transmissionRaw":"CVT","driveType":"4WD/AWD","driveTypeRaw":"4WD","engineSize":"1,998cc","fuelType":"Gasoline","fuelTypeRaw":"ガソリン","bodyType":"Sedan","bodyTypeRaw":"セダン","doors":4,"seats":5,"dealerRaw":"スバル信州 新潟中央店","dealer":"Subaru Shinshu Niigata Chuo","locationRaw":"新潟県","location":"Niigata Prefecture","description":"STI Sport specification. One owner...","descriptionRaw":"STI Sport仕様。ワンオーナー。...","images":["https://img.goo-net.com/001/1234567890_1.jpg","https://img.goo-net.com/001/1234567890_2.jpg"],"extractedAt":"2025-01-15T10:30:00.000Z"}
`;

/** Translation reference — Japanese → English field values. */
export const TRANSLATE_PROMPT = `## Translation Reference

Use these tables to translate Japanese fields to English. Apply them consistently.

### Title Translation
Romanize car model names. Translate feature keywords:
| Japanese | English |
|----------|---------|
| トヨタ | Toyota |
| ホンダ | Honda |
| ニッサン / 日産 | Nissan |
| スバル | Subaru |
| マツダ | Mazda |
| スズキ | Suzuki |
| ダイハツ | Daihatsu |
| ミツビシ / 三菱 | Mitsubishi |
| レクサス | Lexus |
| 認定中古車 | Certified Pre-Owned |
| 禁煙車 | Non-Smoker Vehicle |
| ワンオーナー | One Owner |
| ローダウン車 | Lowered |
| 衝突被害軽減ブレーキ | Collision Mitigation Brake |
| 両側パワースライドドア | Dual Power Sliding Doors |
| パワースライドドア | Power Sliding Door |
| 片側オートスライドドア | One-Side Auto Sliding Door |
| 両側電動スライドドア | Dual Electric Sliding Doors |
| 電動スライドドア | Electric Sliding Door |
| ＬＥＤライト / ＬＥＤヘッドライト | LED Headlights |
| ＬＥＤヘッドランプ | LED Headlamps |
| ＳＤナビ / ナビ | SD Navigation |
| バックモニター / バックカメラ | Backup Camera |
| フルセグ / フルセグＴＶ | Full-Seg TV |
| ＥＴＣ | ETC |
| ＥＴＣ２．０ | ETC 2.0 |
| シートヒーター | Seat Heaters |
| スマートキー | Smart Key |
| キーフリー | Keyless Entry |
| プッシュスタート | Push Start |
| 記録簿 / 点検記録簿 | Service Records |
| オートエアコン | Auto A/C |
| ドライブレコーダー / ドラレコ | Dashcam |
| クルーズコントロール / クルコン | Cruise Control |
| アダプティブクルーズコントロール | Adaptive Cruise Control |
| オートマチックハイビーム | Automatic High Beams |
| オートハイビーム | Auto High Beams |
| アイドリングストップ | Idle Stop |
| パノラマルーフ | Panoramic Roof |
| サンルーフ / ムーンルーフ | Sunroof / Moonroof |
| 純正ＡＷ / 純正アルミ | Factory Alloy Wheels |
| 社外ＡＷ / 社外アルミ | Aftermarket Alloy Wheels |
| ＡＷ / アルミホイール | Alloy Wheels |
| スペアタイヤ | Spare Tire |
| ブルートゥース | Bluetooth |
| ＣＤ / ＤＶＤ再生 | CD/DVD Playback |
| ＨＤＭＩ接続 | HDMI Input |
| トノカバー | Tonneau Cover |
| パワーシート | Power Seats |
| 本革シート / 革シート | Leather Seats |
| ハーフレザー | Half Leather |
| モデリスタエアロ | Modellista Aero |
| 寒冷地仕様 | Cold Weather Spec |
| パワーバックドア | Power Tailgate |
| デジタルインナーミラー | Digital Rearview Mirror |
| ヘッドアップディスプレイ | Head-Up Display |
| 全周囲モニター / 全周囲カメラ / パノラミックビュー | Surround View Camera |
| コーナーセンサー | Corner Sensors |
| クリアランスソナー | Clearance Sonar |
| 横滑り防止装置 / 横滑り防止機能 | Stability Control |
| 誤発進抑制機能 | False Start Prevention |
| 車線逸脱防止支援システム | Lane Departure Prevention |
| レーンキープアシスト | Lane Keep Assist |
| レーンアシスト | Lane Assist |
| ブラインドスポットモニター | Blind Spot Monitor |
| リヤクロストラフィックアラート | Rear Cross Traffic Alert |
| 盗難防止装置 | Anti-Theft System |
| ＡＢＳ | ABS |
| ＡＣ１００Ｖ電源 | AC 100V Outlet |
| 光軸調整ダイヤル | Headlight Leveling Dial |
| 電動格納ミラー / 電格ミラー | Power Folding Mirrors |
| ステアリングスイッチ | Steering Wheel Switches |
| プライバシーガラス | Privacy Glass |
| リアワイパー | Rear Wiper |
| ウオークスルー | Walk-Through |
| サイドバイザー | Side Visors |
| オットマン | Ottoman |
| 前席シートヒーター | Front Seat Heaters |
| ディスプレイオーディオ | Display Audio |
| 左右独立ＡＡＣ | Dual-Zone Auto A/C |
| リヤＡＡＣ | Rear A/C |
| ＨＩＤヘッドライト | HID Headlights |
| ３眼ＬＥＤ | Triple-Beam LED |
| シートベンチレーション | Seat Ventilation |
| ナッパレザーシート | Nappa Leather Seats |
| フリップダウンモニター | Flip-Down Monitor |
| トヨタセーフティセンス | Toyota Safety Sense |
| トヨタチームメイト | Toyota Teammate |
| 地デジ | Digital TV |
| レーダークルーズ | Radar Cruise Control |
| ＴＶキャンセラー | TV Canceller |
| Ａエディション | A Edition |
| Ｇエディション | G Edition |
| ゴールデンアイズ | Golden Eyes |
| ハイブリッド | Hybrid |
| ４ＷＤ | 4WD |
| パノラマモニター対応 | Panoramic Monitor Compatible |
| オートライト | Auto Lights |
| タイベル | Timing Belt |
| ウォーポン | Water Pump |
| ラジエータ | Radiator |
| サーモスタット | Thermostat |
| 交換済 | Replaced |

### Colors
| Japanese | English |
|----------|---------|
| 白 / ホワイト | White |
| 黒 / ブラック | Black |
| 赤 / レッド | Red |
| 青 / ブルー | Blue |
| 緑 / グリーン | Green |
| シルバー / 銀 | Silver |
| グレー / 灰 | Gray |
| 黄 / イエロー | Yellow |
| オレンジ | Orange |
| 紫 / パープル | Purple |
| ブラウン / 茶 | Brown |
| ピンク | Pink |
| ベージュ | Beige |
| ゴールド / 金 | Gold |
| パール | Pearl |
| メタリック | Metallic |
| マイカ | Mica |
| クリスタルシャイン | Crystal Shine |
| パールマイカ | Pearl Mica |
| ツートン | Two-Tone |

Translate compound color names by romanizing the descriptive parts and translating the color words (e.g. "プラチナホワイトパールマイカ" → "Platinum White Pearl Mica", "ブラックマイカメタリック" → "Black Mica Metallic", "レーザーブルークリスタルシャイン" → "Laser Blue Crystal Shine").

### Transmission
| Japanese | English |
|----------|---------|
| AT / ＡＴ | Automatic |
| インパネAT | Column Automatic |
| AT4速 / ＡＴ４速 | 4-Speed Automatic |
| CVT / ＣＶＴ | CVT |
| MT / ＭＴ | Manual |

### Drive Type
| Japanese | English |
|----------|---------|
| FF / ＦＦ | FWD |
| FR / ＦＲ | RWD |
| 4WD / ４ＷＤ | 4WD/AWD |

### Fuel Type
| Japanese | English |
|----------|---------|
| ガソリン | Gasoline |
| ディーゼル | Diesel |
| ハイブリッド | Hybrid |
| 電気 / EV | Electric |
| LPG | LPG |
| CNG | CNG |

### Body Type
| Japanese | English |
|----------|---------|
| セダン | Sedan |
| SUV | SUV |
| SUV・クロスカントリー | SUV / Crossover |
| ワゴン | Wagon |
| ハッチバック | Hatchback |
| クーペ | Coupe |
| コンパクト | Compact |
| トラック | Truck |
| バン | Van |
| ミニバン | Minivan |
| ミニバン・ワンボックス | Minivan / One-Box |
| ボンネットバン | Bonnet Van |
| オープン | Convertible |
| ピックアップ | Pickup |

### Description
Translate the full description field to natural English. ALL feature keywords from the Title Translation table above apply here too. Keep proper nouns (dealer names, location names, model names) in romanized form.

### Dealer
Translate dealer names to English. Use common romanizations for well-known brands (e.g. "トヨタ" → "Toyota", "ホンダ" → "Honda", "スバル" → "Subaru"). For shop/location suffixes:
| Japanese | English |
|----------|---------|
| 店 | Shop / Store |
| 支店 | Branch |
| 中央店 | Chuo (Central) |
| 本店 | Main Store / HQ |
| 販売店 | Dealer |
| 自動車 | Motors / Auto |
| （株）/ 株式会社 | Co., Ltd. |
| Ｕステージ | U-Station |
| Ｕ－ＣＡＲ / Ｕ－Ｃａｒ | U-Car |
| ＢＡＳＥ | BASE |
Keep region names in romanized form (e.g. "信州" → "Shinshu", "関東" → "Kanto").

### Location
Translate Japanese prefectures and regions to English:
| Japanese | English |
|----------|---------|
| 北海道 | Hokkaido |
| 東京都 | Tokyo |
| 大阪府 | Osaka |
| 神奈川県 | Kanagawa |
| 愛知県 | Aichi |
| 埼玉県 | Saitama |
| 千葉県 | Chiba |
| 兵庫県 | Hyogo |
| 福岡県 | Fukuoka |
| 静岡県 | Shizuoka |
| 茨城県 | Ibaraki |
| 広島県 | Hiroshima |
| 京都府 | Kyoto |
| 新潟県 | Niigata |
| 宮城県 | Miyagi |
| 長野県 | Nagano |
| 岐阜県 | Gifu |
| 栃木県 | Tochigi |
| 群馬県 | Gunma |
| 岡山県 | Okayama |
| 福島県 | Fukushima |
| 三重県 | Mie |
| 熊本県 | Kumamoto |
| 鹿児島県 | Kagoshima |
| 沖縄県 | Okinawa |
| 滋賀県 | Shiga |
| 奈良県 | Nara |
| 長崎県 | Nagasaki |
| 青森県 | Aomori |
| 岩手県 | Iwate |
| 秋田県 | Akita |
| 山形県 | Yamagata |
| 富山県 | Toyama |
| 石川県 | Ishikawa |
| 福井県 | Fukui |
| 山梨県 | Yamanashi |
| 和歌山県 | Wakayama |
| 鳥取県 | Tottori |
| 島根県 | Shimane |
| 山口県 | Yamaguchi |
| 徳島県 | Tokushima |
| 香川県 | Kagawa |
| 愛媛県 | Ehime |
| 高知県 | Kochi |
| 佐賀県 | Saga |
| 大分県 | Oita |
| 宮崎県 | Miyazaki |
Append "Prefecture" for -県 endings (e.g. "新潟県" → "Niigata Prefecture"). For -都 (Tokyo) and -府 (Kyoto, Osaka) use just the city name. For -道 use "Hokkaido". For city/ward/address details, romanize them naturally (e.g. "上尾市" → "Ageo City", "港北区" → "Kohoku Ward").
`;