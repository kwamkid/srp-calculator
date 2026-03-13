import * as XLSX from "xlsx";

export interface ParsedProduct {
  name: string;
  category: string;
  sku: string;
  fob_usd: number;
  fob_eur: number;
  freight_do: number;
  import_tax_pct: number;
  shipping_cost: number;
  srp_usd: number;
  srp_eur: number;
  multiplier: number;
  notes: string;
}

type Field = keyof ParsedProduct;

const COLUMN_MAP: Record<string, Field> = {
  // Product name
  product: "name",
  "product name": "name",
  name: "name",
  // Category
  category: "category",
  "product category": "category",
  // SKU
  sku: "sku",
  "product code": "sku",
  code: "sku",
  // FOB USD
  "fob (usd)": "fob_usd",
  "fob usd": "fob_usd",
  fob: "fob_usd",
  "cost usd": "fob_usd",
  "cost (usd)": "fob_usd",
  // FOB EUR
  "fob (eur)": "fob_eur",
  "fob eur": "fob_eur",
  "cost eur": "fob_eur",
  "cost (eur)": "fob_eur",
  // Freight + D/O (combined)
  "freight + d/o": "freight_do",
  "freight + d/o (thb)": "freight_do",
  "freigth + d/o (thb)": "freight_do",
  "freight+d/o": "freight_do",
  "freight+do": "freight_do",
  "freight & d/o": "freight_do",
  freight: "freight_do",
  "freight/do": "freight_do",
  // Import tax
  "import tax (%)": "import_tax_pct",
  "import tax": "import_tax_pct",
  tax: "import_tax_pct",
  "tax %": "import_tax_pct",
  "tax (%)": "import_tax_pct",
  // Shipping cost (separate)
  "shipping cost": "shipping_cost",
  "shipping cost (thb)": "shipping_cost",
  shipping: "shipping_cost",
  "ship cost": "shipping_cost",
  // SRP USD
  "srp (usd)": "srp_usd",
  "srp usd": "srp_usd",
  "rrp (usd)": "srp_usd",
  "rrp usd": "srp_usd",
  "retail usd": "srp_usd",
  // SRP EUR
  "srp (eur)": "srp_eur",
  "srp eur": "srp_eur",
  "rrp (eur)": "srp_eur",
  "rrp eur": "srp_eur",
  rrp: "srp_eur",
  "retail eur": "srp_eur",
  srp: "srp_eur",
  // Multiplier
  multiplier: "multiplier",
  x: "multiplier",
  // Notes
  notes: "notes",
  note: "notes",
  remark: "notes",
  remarks: "notes",
};

function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase();
}

function rowsToProducts(
  rows: Record<string, unknown>[],
  defaultMultiplier: number
): ParsedProduct[] {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const mapping: Record<string, Field> = {};
  for (const h of headers) {
    const normalized = normalizeHeader(h);
    if (COLUMN_MAP[normalized]) {
      mapping[h] = COLUMN_MAP[normalized];
    }
  }

  const products: ParsedProduct[] = [];
  for (const row of rows) {
    const nameKey = headers.find((h) => mapping[h] === "name");
    const name = nameKey ? (row[nameKey] as string) : "";
    if (!name || name.toString().trim() === "") continue;

    const getStr = (field: Field): string => {
      const key = headers.find((h) => mapping[h] === field);
      if (!key) return "";
      return String(row[key] || "").trim();
    };

    const getNum = (field: Field): number => {
      const key = headers.find((h) => mapping[h] === field);
      if (!key) return 0;
      const val = row[key];
      if (typeof val === "number") return val;
      // Strip all currency symbols, whitespace, commas, % etc.
      const str = String(val)
        .replace(/[฿€$£¥₩₹₪₫₱\u200B\u00A0,\s]/g, "")
        .replace("%", "");
      return parseFloat(str) || 0;
    };

    products.push({
      name: name.toString().trim(),
      category: getStr("category"),
      sku: getStr("sku"),
      fob_usd: getNum("fob_usd"),
      fob_eur: getNum("fob_eur"),
      freight_do: getNum("freight_do"),
      import_tax_pct: getNum("import_tax_pct") || 5,
      shipping_cost: getNum("shipping_cost"),
      srp_usd: getNum("srp_usd"),
      srp_eur: getNum("srp_eur"),
      multiplier: getNum("multiplier") || defaultMultiplier,
      notes: getStr("notes"),
    });
  }

  return products;
}

export function parseExcel(
  buffer: ArrayBuffer,
  defaultMultiplier: number = 3
): ParsedProduct[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // If there are merged cells, unmerge them so sheet_to_json
  // doesn't create duplicate/empty rows from merged regions
  if (ws["!merges"]) {
    for (const merge of ws["!merges"]) {
      const topLeft = ws[XLSX.utils.encode_cell(merge.s)];
      if (!topLeft) continue;
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          if (r === merge.s.r && c === merge.s.c) continue;
          const addr = XLSX.utils.encode_cell({ r, c });
          ws[addr] = { ...topLeft };
        }
      }
    }
    delete ws["!merges"];
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });

  const products = rowsToProducts(rows, defaultMultiplier);

  // Deduplicate: same name + sku = duplicate
  const seen = new Set<string>();
  return products.filter(p => {
    const key = `${p.name}|||${p.sku}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseTSV(
  text: string,
  defaultMultiplier: number = 3
): ParsedProduct[] {
  // Split into lines, handle quoted fields with newlines
  const lines: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\r") {
      // Always skip \r (both inside and outside quotes)
      continue;
    } else if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === "\n" && !inQuote) {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.replace(/^"|"$/g, "").trim());

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t").map((c) => c.replace(/^"|"$/g, "").trim());
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      row[h] = cells[j] ?? "";
    });
    rows.push(row);
  }

  return rowsToProducts(rows, defaultMultiplier);
}
