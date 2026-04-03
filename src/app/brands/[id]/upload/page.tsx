"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Upload,
  Download,
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginPage } from "@/components/LoginPage";
import { supabase } from "@/lib/supabase";
import { parseExcel, parseTSV } from "@/lib/parseExcel";
import type { ParsedProduct } from "@/lib/parseExcel";
import type { Brand } from "@/lib/types";
import Link from "next/link";
import * as XLSX from "xlsx";

export default function UploadPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const brandId = params.id as string;

  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    count: number;
    message: string;
  } | null>(null);
  const [preview, setPreview] = useState<
    { name: string; fob_usd: number; fob_eur: number; srp_usd: number; srp_eur: number }[]
  >([]);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .single()
      .then(({ data }) => {
        setBrand(data);
        setLoading(false);
      });
  }, [user, brandId]);

  const showPreview = useCallback((parsed: ParsedProduct[]) => {
    setParsedProducts(parsed);
    setPreview(
      parsed.map((p) => ({
        name: p.name,
        fob_usd: p.fob_usd,
        fob_eur: p.fob_eur,
        srp_usd: p.srp_usd,
        srp_eur: p.srp_eur,
      }))
    );
    setResult(null);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !brand) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        setFileBuffer(buffer);
        const parsed = parseExcel(buffer, brand.default_multiplier);
        showPreview(parsed);
        setPasteText("");
      };
      reader.readAsArrayBuffer(file);
    },
    [brand, showPreview]
  );

  const handlePaste = useCallback(
    (text: string) => {
      setPasteText(text);
      if (!brand || !text.trim()) {
        setParsedProducts([]);
        setPreview([]);
        return;
      }
      const parsed = parseTSV(text, brand.default_multiplier);
      showPreview(parsed);
      setFileBuffer(null);
    },
    [brand, showPreview]
  );

  const handleUpload = useCallback(async () => {
    if (parsedProducts.length === 0 || !brand) return;
    setUploading(true);
    setResult(null);

    try {
      const products = parsedProducts.map((p, i) => ({
        brand_id: brandId,
        name: p.name,
        category: p.category,
        sku: p.sku,
        fob_usd: p.fob_usd,
        fob_eur: p.fob_eur,
        freight_do: p.freight_do,
        import_tax_pct: p.import_tax_pct,
        shipping_cost: p.shipping_cost,
        srp_usd: p.srp_usd,
        srp_eur: p.srp_eur,
        multiplier: p.multiplier,
        notes: p.notes,
        sort_order: i,
      }));

      const { error } = await supabase.from("products").insert(products);
      if (error) {
        setResult({ success: false, count: 0, message: error.message });
      } else {
        setResult({
          success: true,
          count: products.length,
          message: `Uploaded ${products.length} products successfully!`,
        });
        setPreview([]);
        setParsedProducts([]);
        setFileBuffer(null);
        setPasteText("");
      }
    } catch {
      setResult({
        success: false,
        count: 0,
        message: "Failed to parse data",
      });
    }
    setUploading(false);
  }, [parsedProducts, brand, brandId]);

  const handleDownloadTemplate = useCallback(() => {
    const headers = [
      "Product",
      "Category",
      "SKU",
      "FOB (USD)",
      "FOB (EUR)",
      "Freight + D/O",
      "Import Tax (%)",
      "Shipping Cost",
      "SRP (USD)",
      "SRP (EUR)",
      "Multiplier",
      "Notes",
    ];

    const sampleData = [
      {
        Product: "Example Product A",
        Category: "Chair",
        SKU: "SKU-001",
        "FOB (USD)": 108.82,
        "FOB (EUR)": "",
        "Freight + D/O": 15,
        "Import Tax (%)": 5,
        "Shipping Cost": 10,
        "SRP (USD)": "",
        "SRP (EUR)": 259,
        Multiplier: 3,
        Notes: "",
      },
      {
        Product: "Example Product B",
        Category: "Accessory",
        SKU: "SKU-002",
        "FOB (USD)": 24.79,
        "FOB (EUR)": "",
        "Freight + D/O": 15,
        "Import Tax (%)": 5,
        "Shipping Cost": 10,
        "SRP (USD)": "",
        "SRP (EUR)": 59,
        Multiplier: 3,
        Notes: "optional note",
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });

    ws["!cols"] = [
      { wch: 25 }, // Product
      { wch: 15 }, // Category
      { wch: 12 }, // SKU
      { wch: 12 }, // FOB USD
      { wch: 12 }, // FOB EUR
      { wch: 16 }, // Freight + D/O
      { wch: 14 }, // Import Tax
      { wch: 14 }, // Shipping Cost
      { wch: 12 }, // SRP USD
      { wch: 12 }, // SRP EUR
      { wch: 12 }, // Multiplier
      { wch: 20 }, // Notes
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "product-upload-template.xlsx");
  }, []);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (!brand) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-700">Brand not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              Upload Products
            </h1>
            <p className="text-xs text-gray-700">{brand.name}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* File upload area */}
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-10 text-center mb-6">
          <Upload className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-gray-800 mb-2">
            Upload Excel File
          </h2>
          <p className="text-sm text-gray-700 mb-4 max-w-md mx-auto">
            Upload .xlsx, .xls, or .csv file with product data
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 bg-amber-400 text-gray-900 rounded-lg font-medium text-sm hover:bg-amber-500 transition-colors"
            >
              Choose File
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-800 border border-gray-300 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>
          </div>
        </div>

        {/* Paste area */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">
              Or Paste from Excel / Google Sheets
            </h3>
            {pasteText && parsedProducts.length > 0 && (
              <span className="text-xs text-green-600 font-medium">
                {parsedProducts.length} products detected
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mb-2">
            Copy rows from Excel (include header row) then paste here. Tab-separated format.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => handlePaste(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData("text");
              handlePaste(text);
            }}
            placeholder={`Product\tCategory\tSKU\tFOB (USD)\tFOB (EUR)\tFreight + D/O\tImport Tax (%)\tShipping Cost\tSRP (USD)\tSRP (EUR)\tMultiplier\tNotes\nRed Pencils 6pcs\tColor Pencils\tFM600209\t$2.82\t\t5\t10\t5\t$9.99\t\t3\t`}
            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono text-gray-900 resize-y focus:ring-2 focus:ring-blue-400 focus:border-blue-400 placeholder:text-gray-300"
          />
          {pasteText && parsedProducts.length === 0 && (
            <p className="text-xs text-red-500 mt-1">
              No products detected. Make sure the first row is the header row.
            </p>
          )}
        </div>

        {/* Column guide */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            Column Guide
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="px-3 py-2 text-left font-medium">Column (A→L)</th>
                  <th className="px-3 py-2 text-left font-medium">Header Name</th>
                  <th className="px-3 py-2 text-center font-medium">Required</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-left font-medium">Example</th>
                </tr>
              </thead>
              <tbody className="text-gray-800">
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-600">A</td>
                  <td className="px-3 py-2 font-semibold">Product</td>
                  <td className="px-3 py-2 text-center"><span className="text-red-500 font-bold">*</span></td>
                  <td className="px-3 py-2">Product name</td>
                  <td className="px-3 py-2 text-gray-600">Tripp Trapp Chair</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-600">B</td>
                  <td className="px-3 py-2 font-semibold">Category</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">Product category / group</td>
                  <td className="px-3 py-2 text-gray-600">Tripp Trapp</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-600">C</td>
                  <td className="px-3 py-2 font-semibold">SKU</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">Product code / SKU</td>
                  <td className="px-3 py-2 text-gray-600">TT-001</td>
                </tr>
                <tr className="border-t border-gray-100 bg-blue-50/50">
                  <td className="px-3 py-2 font-mono text-gray-600">D</td>
                  <td className="px-3 py-2 font-semibold">FOB (USD)</td>
                  <td className="px-3 py-2 text-center"><span className="text-orange-500 font-bold">*</span></td>
                  <td className="px-3 py-2">Cost price in USD (use D or E)</td>
                  <td className="px-3 py-2 text-gray-600">108.82</td>
                </tr>
                <tr className="border-t border-gray-100 bg-blue-50/50">
                  <td className="px-3 py-2 font-mono text-gray-600">E</td>
                  <td className="px-3 py-2 font-semibold">FOB (EUR)</td>
                  <td className="px-3 py-2 text-center"><span className="text-orange-500 font-bold">*</span></td>
                  <td className="px-3 py-2">Cost price in EUR (use D or E)</td>
                  <td className="px-3 py-2 text-gray-600">99.50</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-600">F</td>
                  <td className="px-3 py-2 font-semibold">Freight + D/O</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">Freight + D/O clearance fee (THB)</td>
                  <td className="px-3 py-2 text-gray-600">15</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-600">G</td>
                  <td className="px-3 py-2 font-semibold">Import Tax (%)</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">Import duty % (default: 5)</td>
                  <td className="px-3 py-2 text-gray-600">5</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-600">H</td>
                  <td className="px-3 py-2 font-semibold">Shipping Cost</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">Shipping cost (THB)</td>
                  <td className="px-3 py-2 text-gray-600">10</td>
                </tr>
                <tr className="border-t border-gray-100 bg-purple-50/50">
                  <td className="px-3 py-2 font-mono text-gray-600">I</td>
                  <td className="px-3 py-2 font-semibold">SRP (USD)</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">International retail price in USD</td>
                  <td className="px-3 py-2 text-gray-600">299</td>
                </tr>
                <tr className="border-t border-gray-100 bg-purple-50/50">
                  <td className="px-3 py-2 font-mono text-gray-600">J</td>
                  <td className="px-3 py-2 font-semibold">SRP (EUR)</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">International retail price in EUR</td>
                  <td className="px-3 py-2 text-gray-600">259</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-600">K</td>
                  <td className="px-3 py-2 font-semibold">Multiplier</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">Price multiplier (default: {brand?.default_multiplier || 3})</td>
                  <td className="px-3 py-2 text-gray-600">3</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-600">L</td>
                  <td className="px-3 py-2 font-semibold">Notes</td>
                  <td className="px-3 py-2 text-center text-gray-500">-</td>
                  <td className="px-3 py-2">Notes / remarks</td>
                  <td className="px-3 py-2 text-gray-600">New color 2025</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-gray-600">
            <span><span className="text-red-500 font-bold">*</span> = Required</span>
            <span><span className="text-orange-500 font-bold">*</span> = FOB: use USD or EUR (at least one)</span>
            <span>Column order doesn&apos;t matter, system matches by header name</span>
          </div>
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-800">
                  Preview: {preview.length} products
                </span>
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploading ? "Uploading..." : "Upload to Database"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-100 text-gray-800 text-xs font-semibold">
                    <th className="px-4 py-2.5 text-left">#</th>
                    <th className="px-4 py-2.5 text-left">Product</th>
                    <th className="px-4 py-2.5 text-right">FOB</th>
                    <th className="px-4 py-2.5 text-right">SRP</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((p, i) => (
                    <tr key={i} className="border-t border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                        {p.fob_usd > 0
                          ? `$${p.fob_usd}`
                          : p.fob_eur > 0
                          ? `€${p.fob_eur}`
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-700">
                        {p.srp_usd > 0
                          ? `$${p.srp_usd}`
                          : p.srp_eur > 0
                          ? `€${p.srp_eur}`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                  {preview.length > 20 && (
                    <tr className="border-t border-gray-50">
                      <td
                        colSpan={4}
                        className="px-4 py-2 text-center text-gray-600 text-xs"
                      >
                        ... and {preview.length - 20} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Result message */}
        {result && (
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${
              result.success
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {result.success ? (
              <Check className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm">{result.message}</span>
            {result.success && (
              <Link
                href={`/brands/${brandId}`}
                className="ml-auto text-sm font-medium text-green-700 hover:text-green-800 underline"
              >
                View Prices →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
