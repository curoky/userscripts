import type { Order, OrderLedger } from "./orders.js";

export const headers = [
  "记录类型",
  "订单号",
  "父订单号",
  "下单时间",
  "订单状态",
  "店铺",
  "商品明细",
  "订单金额",
  "汇总订单金额（非净支出）",
  "币种",
  "支付方式",
  "拆单原因",
  "子单数量",
  "子单金额合计",
  "父子金额校验",
  "备注",
];

const note =
  "订单页展示金额，含取消及零元订单；未扣退款，不代表实际支付流水或净支出";
const money = (cents: number): string => (cents / 100).toFixed(2);

export function csvCell(value: string): string {
  // CSV 无类型信息；文本前置单引号避免商品名被电子表格当作公式执行。
  let leading = value.trimStart();
  while (leading && leading.charCodeAt(0) < 32) {
    leading = leading.slice(1).trimStart();
  }
  const safe =
    /^[=+\-@]/.test(leading) || value.charCodeAt(0) < 32 ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export interface YearCsv {
  year: number;
  csv: string;
  orders: number;
  splitGroups: number;
  mismatches: number;
}

function orderRow(order: Order, parentId = ""): string[] {
  const details = order.products
    .map(
      (product) =>
        `${product.name} × ${product.quantity}${product.sku ? ` [SKU:${product.sku}]` : ""}`,
    )
    .join("\n");
  return [
    parentId ? "拆单子订单" : "独立订单",
    `'${order.id}`,
    parentId ? `'${parentId}` : "",
    order.placedAt,
    order.status,
    order.shop,
    details,
    money(order.amount),
    parentId ? "" : money(order.amount),
    order.currency,
    order.payment,
    "",
    "",
    "",
    "",
    note,
  ];
}

export function exportYears(ledger: OrderLedger): YearCsv[] {
  const children = new Map<string, Order[]>();
  for (const order of ledger.orders.values()) {
    const parentId = ledger.parentByChild.get(order.id);
    if (parentId) {
      const group = children.get(parentId) ?? [];
      group.push(order);
      children.set(parentId, group);
    }
  }
  const buckets = new Map<
    number,
    {
      rows: string[][];
      orders: number;
      splitGroups: number;
      mismatches: number;
    }
  >();
  const records = [
    ...ledger.parents.values(),
    ...Array.from(ledger.orders.values()).filter(
      (order) => !ledger.parentByChild.has(order.id),
    ),
  ].sort(
    (a, b) => b.placedAt.localeCompare(a.placedAt) || a.id.localeCompare(b.id),
  );
  for (const record of records) {
    const year = Number(record.placedAt.slice(0, 4));
    const bucket = buckets.get(year) ?? {
      rows: [],
      orders: 0,
      splitGroups: 0,
      mismatches: 0,
    };
    buckets.set(year, bucket);
    if (record.kind === "order") {
      bucket.rows.push(orderRow(record));
      bucket.orders++;
      continue;
    }
    const group = children.get(record.id);
    if (!group?.length) throw new Error(`父订单 ${record.id} 缺少子订单`);
    const sum = group.reduce((total, child) => total + child.amount, 0);
    const matched = sum === record.amount;
    const statuses = Array.from(
      new Set(group.map((child) => child.status)),
    ).join(" / ");
    bucket.rows.push([
      "拆单父订单",
      `'${record.id}`,
      "",
      record.placedAt,
      statuses,
      "",
      "",
      money(record.amount),
      money(record.amount),
      record.currency,
      "",
      record.reason,
      String(group.length),
      money(sum),
      matched ? "一致" : "不一致，请核对",
      matched
        ? note
        : `${note}；子单合计与父单金额不同，可能有取消、调整或页面遗漏，请核对拆单详情`,
    ]);
    for (const child of group) bucket.rows.push(orderRow(child, record.id));
    bucket.orders += group.length;
    bucket.splitGroups++;
    if (!matched) bucket.mismatches++;
  }
  return Array.from(buckets)
    .sort(([a], [b]) => b - a)
    .map(([year, bucket]) => ({
      year,
      csv: serializeCsv(bucket.rows),
      orders: bucket.orders,
      splitGroups: bucket.splitGroups,
      mismatches: bucket.mismatches,
    }));
}

export function serializeCsv(rows: string[][]): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
