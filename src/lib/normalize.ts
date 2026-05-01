export function normalizeText(v: string) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

export function removeDiacritics(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function cityKey(v: string) {
  const raw = removeDiacritics(normalizeText(v)).toUpperCase();
  const noState = raw
    .replace(/\s*\/\s*SP\s*$/i, "")
    .replace(/\s*-\s*SP\s*$/i, "")
    .replace(/\s+SP\s*$/i, "")
    .trim();

  const cleaned = noState.replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();

  const fixes: Record<string, string> = {
    PRADOLIOIS: "PRADOPOLIS",
    PRADOPOLISSP: "PRADOPOLIS",
  };

  return fixes[cleaned] ?? cleaned;
}

export function titleCase(v: string) {
  const s = normalizeText(v).toLowerCase();
  return s.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}

