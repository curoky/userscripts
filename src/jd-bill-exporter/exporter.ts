import { exportYears, serializeCsv, type YearCsv } from "./csv.js";
import {
  assertAllOrders,
  type PageSnapshot,
  type Period,
  parsePeriods,
  readPage,
  selectors,
} from "./order-page.js";
import { OrderLedger } from "./orders.js";

function checkSignal(signal: AbortSignal): void {
  signal.throwIfAborted();
}

async function waitFor<T>(
  read: () => T | undefined,
  signal: AbortSignal,
  stableMs = 0,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let key = "";
    let stableSince = 0;
    let lastError = "京东页面未响应";
    const started = performance.now();
    const finish = (error?: unknown, value?: T) => {
      clearInterval(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value as T);
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
        checkSignal(signal);
        const value = read();
        if (value === undefined) {
          key = "";
          return;
        }
        if (stableMs === 0) {
          finish(undefined, value);
          return;
        }
        const nextKey = JSON.stringify(value);
        if (key !== nextKey) {
          key = nextKey;
          stableSince = performance.now();
        }
        if (performance.now() - stableSince >= stableMs)
          finish(undefined, value);
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

function menu(): Element {
  const element = document.querySelector(selectors.menu);
  if (!element) throw new Error("未找到京东订单年度筛选菜单");
  return element;
}

async function openMenu(signal: AbortSignal): Promise<HTMLElement[]> {
  let options = Array.from(
    menu().querySelectorAll<HTMLElement>(selectors.periodOption),
  );
  if (!options.length) {
    menu().querySelector<HTMLElement>(selectors.selectedPeriod)?.click();
    options = await waitFor(() => {
      const items = Array.from(
        menu().querySelectorAll<HTMLElement>(selectors.periodOption),
      );
      return items.length ? items : undefined;
    }, signal);
  }
  return options;
}

export async function discoverPeriods(signal: AbortSignal): Promise<Period[]> {
  assertAllOrders();
  const options = await openMenu(signal);
  const periods = parsePeriods(
    options.map((option) => option.textContent?.trim() ?? ""),
    new Date().getFullYear(),
  );
  menu().querySelector<HTMLElement>(selectors.selectedPeriod)?.click();
  return periods;
}

// 监听京东自身的订单请求完成时间，不读取请求体、响应、签名或登录凭据。
async function changePage(
  action: () => void,
  accept: (snapshot: PageSnapshot) => boolean,
  signal: AbortSignal,
): Promise<PageSnapshot> {
  checkSignal(signal);
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
    action();
    return await waitFor(
      () => {
        assertAllOrders();
        if (!requestComplete) return undefined;
        const snapshot = readPage();
        return accept(snapshot) ? snapshot : undefined;
      },
      signal,
      350,
    );
  } finally {
    observer.disconnect();
  }
}

async function firstPage(
  period: Period,
  signal: AbortSignal,
): Promise<PageSnapshot> {
  const current = await waitFor(
    () => {
      assertAllOrders();
      return readPage();
    },
    signal,
    350,
  );
  if (current.period !== period.label) {
    const options = await openMenu(signal);
    const option = options.find(
      (item) => item.textContent?.trim() === period.label,
    );
    if (!option) throw new Error(`京东未提供年度筛选：${period.label}`);
    return changePage(
      () => option.click(),
      (snapshot) => snapshot.period === period.label && snapshot.page === 1,
      signal,
    );
  }
  if (current.page === 1) return current;
  const one = Array.from(
    document.querySelectorAll<HTMLElement>(selectors.page),
  ).find((item) => item.textContent?.trim() === "1");
  if (!one) throw new Error("未找到第一页按钮，请手动返回第一页后重试");
  return changePage(
    () => one.click(),
    (snapshot) => snapshot.page === 1 && snapshot.period === period.label,
    signal,
  );
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

export async function collectPeriod(
  period: Period,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<YearCsv[]> {
  const ledger = new OrderLedger();
  let snapshot = await firstPage(period, signal);
  const totalPages = snapshot.totalPages;
  const visited = new Set<string>();
  for (let page = 1; page <= totalPages; page++) {
    checkSignal(signal);
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
    const next = document.querySelector<HTMLButtonElement>(selectors.next);
    if (!next || next.disabled)
      throw new Error("尚未到最后一页，但下一页按钮不可用");
    snapshot = await changePage(
      () => next.click(),
      (result) => result.page === page + 1 && result.period === period.label,
      signal,
    );
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
