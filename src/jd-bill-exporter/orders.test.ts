import { describe, expect, it } from "vitest";
import { csvCell, exportYears } from "./csv.js";
import {
  type Order,
  OrderLedger,
  type ParentOrder,
  parseDate,
  parseMoney,
} from "./orders.js";

const parent: ParentOrder = {
  kind: "parent",
  id: "1000000000000001",
  placedAt: "2026-10-24 17:11:04",
  amount: 14190,
  currency: "CNY",
  reason: "由于商品存储的库房不同，故拆分为以下订单分开配送",
};
const order = (id: string, amount: number, split = true): Order => ({
  kind: "order",
  id,
  amount,
  split,
  placedAt: parent.placedAt,
  currency: "CNY",
  status: "已完成",
  shop: "京东",
  payment: "在线支付",
  products: [{ name: '杯子，"礼盒"\n含赠品', quantity: 1, sku: "123456" }],
});

describe("JD split-order ledger", () => {
  it("retains parent context across pages and zero-yuan child orders", () => {
    const ledger = new OrderLedger();
    ledger.add([parent, order("1000000000000002", 14190)]);
    ledger.add([order("1000000000000003", 0)]);
    const file = exportYears(ledger)[0];
    expect(file).toMatchObject({
      year: 2026,
      orders: 2,
      splitGroups: 1,
      mismatches: 0,
    });
    expect(file?.csv).toContain('"141.90","141.90"');
    expect(file?.csv).toContain('"0.00","","CNY"');
    expect(file?.csv).toContain('"2","141.90","一致"');
    expect(ledger.parentByChild.get("1000000000000003")).toBe(parent.id);
  });

  it("does not infer a split from identical timestamps", () => {
    const ledger = new OrderLedger();
    ledger.add([
      order("1000000000000002", 100, false),
      order("1000000000000003", 200, false),
    ]);
    expect(ledger.parentByChild.size).toBe(0);
    expect(exportYears(ledger)[0]?.splitGroups).toBe(0);
  });

  it("stops on a child without a parent or after an independent order", () => {
    expect(() =>
      new OrderLedger().add([order("1000000000000002", 100)]),
    ).toThrow("缺少明确的父订单");
    const ledger = new OrderLedger();
    ledger.add([parent, order("1000000000000002", 100, false)]);
    expect(() => ledger.add([order("1000000000000003", 100)])).toThrow(
      "缺少明确的父订单",
    );
  });

  it("rejects unrelated cross-page continuation", () => {
    const ledger = new OrderLedger();
    ledger.add([parent]);
    expect(() =>
      ledger.add([
        { ...order("1000000000000002", 100), placedAt: "2026-10-25 17:11:04" },
      ]),
    ).toThrow("缺少明确的父订单");
  });

  it("deduplicates identical page overlap and rejects changed amounts", () => {
    const ledger = new OrderLedger();
    const child = order("1000000000000002", 14190);
    ledger.add([parent, child]);
    ledger.add([parent, child]);
    expect(exportYears(ledger)[0]?.orders).toBe(1);
    expect(() => ledger.add([{ ...child, amount: 500 }])).toThrow(
      "内容在分页间发生变化",
    );
  });

  it("rejects conflicting parent membership", () => {
    const ledger = new OrderLedger();
    const child = order("1000000000000002", 14190);
    ledger.add([parent, child]);
    expect(() =>
      ledger.add([{ ...parent, id: "1000000000000004" }, child]),
    ).toThrow("拆单关系");
  });

  it("marks mismatches without changing amounts or deleting cancelled children", () => {
    const ledger = new OrderLedger();
    ledger.add([
      parent,
      { ...order("1000000000000002", 10000), status: "已取消" },
    ]);
    const file = exportYears(ledger)[0];
    expect(file?.mismatches).toBe(1);
    expect(file?.csv).toContain('"100.00","不一致，请核对"');
    expect(file?.csv).toContain('"已取消"');
    expect(file?.csv).toContain('"141.90","141.90"');
  });

  it("produces one file per order year for older combined periods", () => {
    const ledger = new OrderLedger();
    ledger.add([
      {
        ...order("1000000000000002", 100, false),
        placedAt: "2013-01-01 00:00:00",
      },
      {
        ...order("1000000000000003", 200, false),
        placedAt: "2012-12-31 23:59:59",
      },
    ]);
    expect(exportYears(ledger).map((file) => file.year)).toEqual([2013, 2012]);
  });
});

describe("JD CSV and input validation", () => {
  it("quotes CSV fields, escapes embedded quotes, uses BOM and CRLF, and preserves long IDs", () => {
    const ledger = new OrderLedger();
    ledger.add([order("1000000000000002", 100, false)]);
    const csv = exportYears(ledger)[0]?.csv ?? "";
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain(`"'1000000000000002"`);
    expect(csv).toContain('"杯子，""礼盒""\n含赠品 × 1 [SKU:123456]"');
  });

  it("neutralizes formula-like text, including whitespace and control prefixes", () => {
    for (const value of [
      "=1+1",
      "+SUM(A1)",
      "-1+1",
      "@name",
      "\t=1",
      " \n=1",
      "\0=1",
    ]) {
      expect(csvCell(value).startsWith(`"'`)).toBe(true);
    }
    expect(csvCell("普通商品")).toBe('"普通商品"');
  });

  it("uses integer cents and rejects missing or ambiguous prices", () => {
    expect(parseMoney("¥ 1,234.56")).toBe(123456);
    expect(parseMoney("￥0.00")).toBe(0);
    expect(parseMoney("0.1")).toBe(10);
    for (const value of [
      "",
      "待付款",
      "¥1.001",
      "-1.00",
      "1e3",
      "¥10 已退款 ¥2",
    ]) {
      expect(() => parseMoney(value)).toThrow();
    }
  });

  it("rejects invalid calendar dates instead of silently normalizing", () => {
    expect(parseDate("2024-02-29 23:59:59")).toBe("2024-02-29 23:59:59");
    expect(() => parseDate("2025-02-29 00:00:00")).toThrow();
    expect(() => parseDate("2026-01-01 24:00:00")).toThrow();
    expect(() => parseDate("昨天")).toThrow();
  });
});
