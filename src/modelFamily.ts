/** Stable model identity used for comparable matching. */
export function normalizeModel(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeMake(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

const trimWords = new Set(["advance", "xd", "r", "g"]);
const prefixAliases = new Set(["legacy", "lc"]);

export function modelFamilyKey(value: string | undefined): string {
  const raw = (value ?? "").trim().toLocaleLowerCase();
  if (!raw) return "";
  const tokens = raw.split(/\s+/).filter(Boolean).map(normalizeModel)
    .filter((token) => !trimWords.has(token) && !/^\d/.test(token));
  if (!tokens.length) return "";
  if (tokens.length > 1 && prefixAliases.has(tokens[0])) tokens.shift();
  return normalizeModel(tokens[0]);
}

export function modelsMatch(left: string | undefined, right: string | undefined): boolean {
  const a = modelFamilyKey(left);
  const b = modelFamilyKey(right);
  return a !== "" && a === b;
}
