import type { Product, CalculatedProduct, Brand, SalesChannel, ChannelProfit } from "./types";

export function roundToNicePrice(raw: number): number {
  if (raw <= 0) return 0;
  if (raw >= 10000) {
    // Round to nearest X,900
    return Math.round((raw - 900) / 1000) * 1000 + 900;
  } else if (raw >= 1000) {
    // Round to nearest X90
    return Math.round((raw - 90) / 100) * 100 + 90;
  } else if (raw >= 100) {
    // Round to nearest X99
    return Math.round((raw - 99) / 100) * 100 + 99;
  } else if (raw >= 10) {
    // Round to nearest X9
    return Math.round((raw - 9) / 10) * 10 + 9;
  }
  return Math.round(raw);
}

export function calculateProduct(
  product: Product,
  brand: Brand
): CalculatedProduct {
  const usdToThb = brand.usd_to_thb || 37;
  const eurToThb = brand.eur_to_thb || 39;

  // FOB in THB (use whichever currency is provided, prefer USD)
  const fobFromUsd = (product.fob_usd || 0) * usdToThb;
  const fobFromEur = (product.fob_eur || 0) * eurToThb;
  const fob_thb = fobFromUsd || fobFromEur;

  // Total import cost = (FOB + Freight+D/O) × (1 + ImportTax%) + Shipping
  const total_import_cost =
    (fob_thb + (product.freight_do || 0)) *
      (1 + (product.import_tax_pct || 0) / 100) +
    (product.shipping_cost || 0);

  // International SRP in THB
  const srpFromUsd = (product.srp_usd || 0) * usdToThb;
  const srpFromEur = (product.srp_eur || 0) * eurToThb;
  const srp_thb = srpFromUsd || srpFromEur;

  // Suggested price = total import cost × multiplier, rounded nicely
  const multiplier = product.multiplier || brand.default_multiplier || 3;
  const rawPrice = total_import_cost * multiplier;
  const suggested_price = roundToNicePrice(rawPrice);

  // Our price (use manual override if set, otherwise suggested)
  const our_price = product.our_price_thb || suggested_price;

  // Margin
  const margin_thb = our_price - total_import_cost;
  const margin_pct = our_price > 0 ? (margin_thb / our_price) * 100 : 0;

  return {
    ...product,
    fob_thb: Math.round(fob_thb * 100) / 100,
    total_import_cost: Math.round(total_import_cost * 100) / 100,
    srp_thb: Math.round(srp_thb * 100) / 100,
    raw_price: Math.round(rawPrice),
    suggested_price,
    margin_pct: Math.round(margin_pct * 100) / 100,
    margin_thb: Math.round(margin_thb * 100) / 100,
  };
}

export function calculateChannelProfit(
  price: number,
  totalImportCost: number,
  channel: SalesChannel
): ChannelProfit {
  // Selling price after permanent promo discount
  const selling_price = price * (1 - (channel.promo_pct || 0) / 100);

  if (channel.type === "online") {
    // Online: commission + transaction fee + service fee + shipping
    const total_fees_pct = (channel.commission_pct || 0) + (channel.transaction_fee_pct || 0) + (channel.service_fee_pct || 0);
    const fees_thb = selling_price * total_fees_pct / 100;
    const our_profit_thb = selling_price - fees_thb - (channel.shipping_thb || 0) - totalImportCost;
    const our_profit_pct = selling_price > 0 ? (our_profit_thb / selling_price) * 100 : 0;

    return {
      channel_name: channel.name,
      channel_type: "online",
      selling_price: Math.round(selling_price),
      total_fees_pct: Math.round(total_fees_pct * 100) / 100,
      fees_thb: Math.round(fees_thb),
      our_profit_thb: Math.round(our_profit_thb),
      our_profit_pct: Math.round(our_profit_pct * 100) / 100,
    };
  }

  // Offline: GP + PC + DC
  const total_fees_pct = (channel.gp_pct || 0) + (channel.pc_pct || 0) + (channel.dc_pct || 0);
  const fees_thb = selling_price * total_fees_pct / 100;
  const our_profit_thb = selling_price - fees_thb - totalImportCost;
  const our_profit_pct = selling_price > 0 ? (our_profit_thb / selling_price) * 100 : 0;

  return {
    channel_name: channel.name,
    channel_type: "offline",
    selling_price: Math.round(selling_price),
    total_fees_pct: Math.round(total_fees_pct * 100) / 100,
    fees_thb: Math.round(fees_thb),
    our_profit_thb: Math.round(our_profit_thb),
    our_profit_pct: Math.round(our_profit_pct * 100) / 100,
  };
}
