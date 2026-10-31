import { exportYears, serializeCsv, type YearCsv } from "./csv.js";
import {
  assertAllOrders,
  type PageSnapshot,
  type Period,
  parsePeriod,
  readPage,
  selectors,
} from "./order-page.js";
import { OrderLedger } from "./orders.js";

async function waitForPage(
  read: () => PageSnapshot | undefined,
  signal: AbortSignal,
): Promise<PageSnapshot> {
  return new Promise((resolve, reject) => {
    let key = "";
    let stableSince = 0;
    let lastError = "京东页面未响应";
    const started = performance.now();
    const finish = (error?: unknown, value?: PageSnapshot) => {
      clearInterval(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (value) resolve(value);
    };
    const abort = () => finish(signal.reason);
    const tick = () => {
      if (performance.now() - started > 30_000) {
        finish(
          new Error(`等待订单页超时：${lastError}。请检查登录、验证提示后重试`),
        );
        return;
      }
      try {
        signal.throwIfAborted();
        const value = read();
        if (value === undefined) {
          key = "";
          return;
        }
        const nextKey = JSON.stringify(value);
        if (key !== nextKey) {
          key = nextKey;
          stableSince = performance.now();
        }
        if (performance.now() - stableSince >= 350) finish(undefined, value);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        key = "";
      }
    };
    const timer = window.setInterval(tick, 100);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else tick();
  });
}

// 监听京东自身的订单请求完成时间，不读取请求体、响应、签名或登录凭据。
async function nextPage(
  previous: PageSnapshot,
  signal: AbortSignal,
): Promise<PageSnapshot> {
  signal.throwIfAborted();
  const next = document.querySelector<HTMLButtonElement>(selectors.next);
  if (!next || next.disabled)
    throw new Error("尚未到最后一页，但下一页按钮不可用");
  const started = performance.now();
  let requestComplete = false;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const url = new URL(entry.name, location.href);
      if (
        entry.startTime >= started &&
        ["color.jd.com", "color.jd.hk"].includes(url.hostname) &&
        url.searchParams.get("functionId") === "pcorder_center_list"
      )
        requestComplete = true;
    }
  });
  observer.observe({ type: "resource" });
  try {
    next.click();
    return await waitForPage(() => {
      assertAllOrders();
      if (!requestComplete) return undefined;
      const snapshot = readPage();
      return snapshot.page === previous.page + 1 ? snapshot : undefined;
    }, signal);
  } finally {
    observer.disconnect();
  }
}

function validateYear(snapshot: PageSnapshot, period: Period): void {
  for (const entry of snapshot.entries) {
    const year = Number(entry.placedAt.slice(0, 4));
    if (
      (period.year !== null && year !== period.year) ||
      (period.before !== null && year >= period.before)
    )
      throw new Error(`年度筛选与订单 ${entry.id} 的下单年份不符，已停止导出`);
  }
}

export async function collectCurrentPeriod(
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<YearCsv[]> {
  signal.throwIfAborted();
  assertAllOrders();
  let snapshot = readPage();
  const period = parsePeriod(snapshot.period, new Date().getFullYear());
  if (snapshot.page !== 1) {
    throw new Error("请先在京东页面回到第一页，再导出当前年度");
  }
  const ledger = new OrderLedger();
  const totalPages = snapshot.totalPages;
  const visited = new Set<string>();
  for (let page = 1; page <= totalPages; page++) {
    signal.throwIfAborted();
    assertAllOrders();
    if (
      snapshot.page !== page ||
      snapshot.totalPages !== totalPages ||
      snapshot.period !== period.label
    )
      throw new Error("订单筛选或总页数在导出期间发生变化，请重新导出");
    validateYear(snapshot, period);
    const ids = snapshot.entries
      .map((entry) => `${entry.kind}:${entry.id}`)
      .join("|");
    if (visited.has(ids)) throw new Error("京东返回了重复订单页，已停止导出");
    visited.add(ids);
    ledger.add(snapshot.entries);
    progress(
      `${period.label}：第 ${page}/${totalPages} 页，已读取 ${ledger.orders.size} 个订单`,
    );
    if (page === totalPages) break;
    snapshot = await nextPage(snapshot, signal);
  }
  const files = exportYears(ledger);
  if (!files.length && period.year !== null) {
    return [
      {
        year: period.year,
        csv: serializeCsv([]),
        orders: 0,
        splitGroups: 0,
        mismatches: 0,
      },
    ];
  }
  return files;
}
