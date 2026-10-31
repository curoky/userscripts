import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectCurrentPeriod } from "./exporter.js";

let notifyResource: (() => void) | undefined;
const item = (id: string, amount: string, split = false) => `
  <div class="orderCard-test">
    <div class="${split ? "splitOrderHeader-test" : "header-test"}">
      <div class="orderTime-test">2026-01-01 00:00:00</div>
      <div class="orderMetas-test"><span class="metaValue-test">${id}</span></div>
      <span class="statusText-test">已完成</span><span class="shopNames-test">京东</span>
    </div>
    <div class="productItem-test"><h3 class="productTitle-test">测试商品</h3><span class="countNum-test">1</span></div>
    <div class="priceRow-test"><span class="priceSymbol-test">¥</span>${amount}</div>
    <div class="paymentTypeName-test">在线支付</div>
  </div>`;
const parent = `
  <div class="splitBanner-test">
    <span class="orderTimeValue-test">2026-01-01 00:00:00</span>
    <div class="infoGroup-test"><span class="label-test">订单号</span><span class="value-test">1000000000000001</span></div>
    <div class="infoGroup-test"><span class="label-test">订单金额</span><span class="value-test">¥10.00</span></div>
    <span class="noticeText-test">分仓配送</span>
  </div>`;

function list(): Element {
  const element = document.querySelector(".listContent-test");
  if (!element) throw new Error("Missing test list");
  return element;
}

function renderPage(page: number, content: string): void {
  list().innerHTML = `${content}<span class="activePage-test">${page}</span><span class="totalText-test">共2页</span>`;
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  });
  notifyResource = undefined;
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      constructor(callback: (entries: { getEntries(): unknown[] }) => void) {
        notifyResource = () =>
          callback({
            getEntries: () => [
              {
                name: "https://color.jd.hk/api?functionId=pcorder_center_list",
                startTime: performance.now(),
              },
            ],
          });
      }
      observe(): void {}
      disconnect(): void {}
    },
  );
  document.body.innerHTML = `
    <div class="statusCard-test selected-test">全部</div><input class="input-test">
    <div class="selectContainer-test"><div class="select-test">2026年订单</div></div>
    <div class="listContent-test"></div><button class="nextBtn-test"></button>`;
  renderPage(1, `${parent}${item("1000000000000002", "10.00", true)}`);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("JD page export workflow", () => {
  it("requires manual year selection and does not open the year menu", async () => {
    const toggle = document.querySelector(".select-test");
    if (!toggle) throw new Error("Missing menu");
    const clicked = vi.fn();
    toggle.addEventListener("click", clicked);
    toggle.textContent = "近3个月订单";
    await expect(
      collectCurrentPeriod(new AbortController().signal, () => {}),
    ).rejects.toThrow("先在京东页面选择");
    expect(clicked).not.toHaveBeenCalled();
    expect(toggle.textContent).toBe("近3个月订单");
  });

  it("requires the first page without navigating backward", async () => {
    renderPage(2, item("1000000000000002", "10.00"));
    const next = document.querySelector(".nextBtn-test");
    if (!next) throw new Error("Missing next button");
    const clicked = vi.fn();
    next.addEventListener("click", clicked);
    await expect(
      collectCurrentPeriod(new AbortController().signal, () => {}),
    ).rejects.toThrow("回到第一页");
    expect(clicked).not.toHaveBeenCalled();
    expect(document.querySelector(".activePage-test")?.textContent).toBe("2");
  });

  it("waits for both the order request and stable DOM before completing a cross-page group", async () => {
    const next = document.querySelector(".nextBtn-test");
    if (!next) throw new Error("Missing next button");
    next.addEventListener("click", () => {
      notifyResource?.();
      setTimeout(
        () => renderPage(2, item("1000000000000003", "0.00", true)),
        500,
      );
    });
    const progress = vi.fn();
    const task = collectCurrentPeriod(new AbortController().signal, progress);
    await vi.advanceTimersByTimeAsync(2000);
    const files = await task;
    expect(files[0]).toMatchObject({
      year: 2026,
      orders: 2,
      splitGroups: 1,
      mismatches: 0,
    });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(files[0]?.csv).toContain('"2","10.00","一致"');
    expect(document.querySelector(".select-test")?.textContent).toBe(
      "2026年订单",
    );
  });

  it("does not accept a page-number change before the order response, and can cancel", async () => {
    const next = document.querySelector(".nextBtn-test");
    if (!next) throw new Error("Missing next button");
    next.addEventListener("click", () =>
      renderPage(2, item("1000000000000003", "0.00", true)),
    );
    const controller = new AbortController();
    const task = collectCurrentPeriod(controller.signal, () => {});
    const rejected = expect(task).rejects.toThrow("用户取消");
    await vi.advanceTimersByTimeAsync(2000);
    controller.abort(new DOMException("用户取消", "AbortError"));
    await rejected;
  });

  it("rejects year changes during pagination", async () => {
    const next = document.querySelector(".nextBtn-test");
    const period = document.querySelector(".select-test");
    if (!next || !period) throw new Error("Missing controls");
    next.addEventListener("click", () => {
      period.textContent = "2025年订单";
      renderPage(2, item("1000000000000003", "0.00", true));
      notifyResource?.();
    });
    const task = collectCurrentPeriod(new AbortController().signal, () => {});
    const rejected = expect(task).rejects.toThrow("订单筛选或总页数");
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
  });

  it("generates a header-only CSV for an explicitly empty selected year", async () => {
    list().innerHTML = '<div class="emptyState-test">暂无订单</div>';
    const files = await collectCurrentPeriod(
      new AbortController().signal,
      () => {},
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      year: 2026,
      orders: 0,
      splitGroups: 0,
      mismatches: 0,
    });
    expect(files[0]?.csv.split("\r\n")).toHaveLength(2);
  });
});
