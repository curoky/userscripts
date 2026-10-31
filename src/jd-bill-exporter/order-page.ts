import {
  type Entry,
  type Product,
  parseDate,
  parseMoney,
  parseOrderId,
} from "./orders.js";

export const selectors = {
  list: "[class*='listContent-']",
  card: "[class*='orderCard-']",
  banner: "[class*='splitBanner-']",
  menu: "[class*='selectContainer-']",
  selectedPeriod: "[class*='select-']",
  periodOption: "[class*='selectList-'] [class*='item-']",
  activePage: "[class*='activePage-']",
  totalPages: "[class*='totalText-']",
  next: "button[class*='nextBtn-']",
  page: "[class*='pageItem-']",
  status: "[class*='statusCard-']",
  search: "input[class*='input-']",
} as const;

function requiredText(
  root: ParentNode,
  selector: string,
  label: string,
): string {
  const value = root.querySelector(selector)?.textContent?.trim();
  if (!value) throw new Error(`京东页面缺少${label}，已停止导出`);
  return value;
}

function currency(root: ParentNode): string {
  const symbol = requiredText(root, "[class*='priceSymbol-']", "金额币种");
  if (!["¥", "￥"].includes(symbol)) {
    throw new Error(`尚不支持的订单币种：${symbol}`);
  }
  return "CNY";
}

function products(card: Element): Product[] {
  const items = Array.from(
    card.querySelectorAll("[class*='productItem-']"),
  ).map((item): Product => {
    const name = requiredText(item, "[class*='productTitle-']", "商品名称");
    const count = requiredText(item, "[class*='countNum-']", "商品数量");
    if (
      !/^\d+$/.test(count) ||
      !Number.isSafeInteger(Number(count)) ||
      Number(count) < 1
    ) {
      throw new Error(`无效商品数量：${count}`);
    }
    const href = item
      .querySelector("a[class*='goodImg-']")
      ?.getAttribute("href");
    let sku = "";
    if (href) {
      const url = new URL(href, "https://item.jd.com");
      if (url.hostname === "item.jd.com" || url.hostname === "item.jd.hk") {
        sku = /^\/(\d+)\.html$/.exec(url.pathname)?.[1] ?? "";
      }
    }
    return { name, quantity: Number(count), sku };
  });
  if (!items.length) throw new Error("订单商品列表为空，已停止导出");
  return items;
}

function readParent(banner: Element): Entry {
  const values = Array.from(banner.querySelectorAll("[class*='infoGroup-']"));
  const field = (label: string): string => {
    const group = values.find(
      (element) =>
        element.querySelector("[class*='label-']")?.textContent?.trim() ===
        label,
    );
    if (!group) throw new Error(`京东拆单标题缺少${label}`);
    return requiredText(group, "[class*='value-']", label);
  };
  const money = field("订单金额");
  if (!/^[¥￥]/.test(money)) throw new Error("无法确认父订单金额币种");
  return {
    kind: "parent",
    id: parseOrderId(field("订单号")),
    placedAt: parseDate(
      requiredText(banner, "[class*='orderTimeValue-']", "父订单下单时间"),
    ),
    amount: parseMoney(money),
    currency: "CNY",
    reason: requiredText(banner, "[class*='noticeText-']", "拆单原因"),
  };
}

export interface PageSnapshot {
  entries: Entry[];
  page: number;
  totalPages: number;
  period: string;
  fingerprint: string;
}

export function readPage(root: Document = document): PageSnapshot {
  const list = root.querySelector(selectors.list);
  if (!list)
    throw new Error("未找到京东新版订单列表，请确认登录并等待页面加载");
  const entries: Entry[] = [];
  // 父单标题与后续子单是相邻节点；按 DOM 顺序保留跨页分组上下文。
  for (const node of list.querySelectorAll(
    `${selectors.banner}, ${selectors.card}`,
  )) {
    if (node.matches(selectors.banner)) {
      entries.push(readParent(node));
      continue;
    }
    entries.push({
      kind: "order",
      id: parseOrderId(
        requiredText(
          node,
          "[class*='orderMetas-'] [class*='metaValue-']",
          "订单号",
        ),
      ),
      placedAt: parseDate(
        requiredText(node, "[class*='orderTime-']", "下单时间"),
      ),
      amount: parseMoney(
        requiredText(node, "[class*='priceRow-']", "订单金额"),
      ),
      currency: currency(node),
      split: !!node.querySelector("[class*='splitOrderHeader-']"),
      status: requiredText(node, "[class*='statusText-']", "订单状态"),
      shop: requiredText(node, "[class*='shopNames-']", "店铺名称"),
      payment: requiredText(node, "[class*='paymentTypeName-']", "支付方式"),
      products: products(node),
    });
  }
  const active = root.querySelector(selectors.activePage)?.textContent?.trim();
  const total = root.querySelector(selectors.totalPages)?.textContent?.trim();
  let page = Number(active);
  let totalPages = Number(/^共\s*(\d+)\s*页$/.exec(total ?? "")?.[1]);
  if (!entries.length) {
    const empty = list.querySelector("[class*='empty'], [class*='Empty']");
    if (!empty || !/暂无|没有|无订单/.test(empty.textContent ?? "")) {
      throw new Error("无法确认列表已加载完毕或没有订单，已停止导出");
    }
    page = 1;
    totalPages = 1;
  }
  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(totalPages) ||
    page < 1 ||
    totalPages < page
  ) {
    throw new Error("无法识别京东分页信息，已停止导出");
  }
  const period = requiredText(
    root.querySelector(selectors.menu) ?? root,
    selectors.selectedPeriod,
    "年度筛选",
  );
  return {
    entries,
    page,
    totalPages,
    period,
    fingerprint: JSON.stringify({ entries, page, totalPages, period }),
  };
}

export function assertAllOrders(root: Document = document): void {
  const selected = root
    .querySelector(`${selectors.status}[class*='selected-']`)
    ?.textContent?.trim();
  if (selected !== "全部") {
    throw new Error("请先将京东订单状态筛选切换为“全部”");
  }
  if (root.querySelector<HTMLInputElement>(selectors.search)?.value.trim()) {
    throw new Error("请先清空京东订单搜索条件");
  }
}

export interface Period {
  label: string;
  year: number | null;
  before: number | null;
}

export function parsePeriods(labels: string[], currentYear: number): Period[] {
  const periods: Period[] = [];
  for (const label of new Set(labels)) {
    if (label === "今年内订单") {
      periods.push({ label, year: currentYear, before: null });
      continue;
    }
    const year = /^(\d{4})年订单$/.exec(label);
    const before = /^(\d{4})前订单$/.exec(label);
    if (year) periods.push({ label, year: Number(year[1]), before: null });
    if (before) periods.push({ label, year: null, before: Number(before[1]) });
  }
  if (!periods.length) throw new Error("未找到按年筛选的订单选项");
  return periods;
}
