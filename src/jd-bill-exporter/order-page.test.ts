import { beforeEach, describe, expect, it } from "vitest";
import { assertAllOrders, parsePeriods, readPage } from "./order-page.js";

const card = (id: string, split: boolean, price = "0.00") => `
  <div class="orderCard-newhash">
    <div class="header-newhash ${split ? "splitOrderHeader-newhash" : ""}">
      <div class="orderTime-newhash">2026-10-24 17:11:04</div>
      <div class="orderMetas-newhash"><span class="metaValue-newhash">${id}</span></div>
      <span class="shopNames-newhash">示例店铺</span>
      <span class="statusText-newhash">已完成</span>
    </div>
    <div class="productItem-newhash">
      <a class="goodImg-newhash" href="//item.jd.com/123456.html?tracking=omitted"></a>
      <h3 class="productTitle-newhash">示例商品</h3><span class="countNum-newhash">1</span>
    </div>
    <div class="priceRow-newhash"><span class="priceSymbol-newhash">¥</span>${price}</div>
    <div class="paymentTypeName-newhash">在线支付</div>
  </div>`;
const banner = `
  <div class="splitBanner-newhash">
    <span class="orderTimeValue-newhash">2026-10-24 17:11:04</span>
    <div class="infoGroup-newhash"><span class="label-newhash">订单号</span><span class="value-newhash">1000000000000001</span></div>
    <div class="infoGroup-newhash"><span class="label-newhash">订单金额</span><span class="value-newhash">¥141.90</span></div>
    <span class="noticeText-newhash">由于库房不同分开配送</span>
  </div>`;

beforeEach(() => {
  document.body.innerHTML = `
    <div class="statusCard-newhash selected-newhash">全部</div>
    <input class="input-newhash">
    <div class="selectContainer-newhash"><div class="select-newhash">今年内订单</div></div>
    <div class="listContent-newhash">
      <div>${banner}<div>${card("1000000000000002", true, "141.90")}</div></div>
      <div><div>${card("1000000000000003", true)}</div></div>
      <div>${card("1000000000000004", false, "10.00")}</div>
      <div class="activePage-newhash">1</div><span class="totalText-newhash">共2页</span>
    </div>`;
});

describe("JD current card layout", () => {
  it("reads the parent followed by all sibling children in document order", () => {
    const snapshot = readPage();
    expect(snapshot.entries.map((entry) => [entry.kind, entry.id])).toEqual([
      ["parent", "1000000000000001"],
      ["order", "1000000000000002"],
      ["order", "1000000000000003"],
      ["order", "1000000000000004"],
    ]);
    expect(snapshot).toMatchObject({
      page: 1,
      totalPages: 2,
      period: "今年内订单",
    });
    expect(snapshot.entries[1]).toMatchObject({
      amount: 14190,
      split: true,
      products: [{ name: "示例商品", quantity: 1, sku: "123456" }],
    });
  });

  it("does not interpret missing amounts as zero", () => {
    document.querySelector(".priceRow-newhash")?.remove();
    expect(() => readPage()).toThrow("订单金额");
  });

  it("rejects a missing parent field rather than falling back to another field", () => {
    document.querySelectorAll(".infoGroup-newhash")[1]?.remove();
    expect(() => readPage()).toThrow("缺少订单金额");
  });

  it("does not treat unloaded, empty lists as a complete year", () => {
    document.querySelector(".listContent-newhash")?.replaceChildren();
    expect(() => readPage()).toThrow("无法确认");
    const empty = document.createElement("div");
    empty.className = "emptyState-newhash";
    empty.textContent = "暂无订单";
    document.querySelector(".listContent-newhash")?.append(empty);
    expect(readPage()).toMatchObject({ entries: [], page: 1, totalPages: 1 });
  });

  it("requires the unfiltered list", () => {
    assertAllOrders();
    const search = document.querySelector<HTMLInputElement>("input");
    const status = document.querySelector(".statusCard-newhash");
    if (!search || !status) throw new Error("Missing test fixture");
    search.value = "商品";
    expect(() => assertAllOrders()).toThrow("清空");
    search.value = "";
    status.textContent = "已完成";
    expect(() => assertAllOrders()).toThrow("全部");
  });

  it("recognizes full years and the older combined period but excludes recent months", () => {
    expect(
      parsePeriods(
        ["近3个月订单", "今年内订单", "2025年订单", "2014前订单", "2025年订单"],
        2026,
      ),
    ).toEqual([
      { label: "今年内订单", year: 2026, before: null },
      { label: "2025年订单", year: 2025, before: null },
      { label: "2014前订单", year: null, before: 2014 },
    ]);
  });
});
