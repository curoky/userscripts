export interface Product {
  name: string;
  quantity: number;
  sku: string;
}

export interface ParentOrder {
  kind: "parent";
  id: string;
  placedAt: string;
  amount: number;
  currency: string;
  reason: string;
}

export interface Order {
  kind: "order";
  id: string;
  placedAt: string;
  amount: number;
  currency: string;
  split: boolean;
  status: string;
  shop: string;
  payment: string;
  products: Product[];
}

export type Entry = ParentOrder | Order;

export function parseMoney(value: string): number {
  const normalized = value.replace(/[¥￥,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`无法识别订单金额：${value || "空值"}`);
  }
  const [integer = "", decimal = ""] = normalized.split(".");
  const cents = Number(integer) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("订单金额超出有效范围");
  return cents;
}

export function parseDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`无法识别下单时间：${value || "空值"}`);
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19).replace("T", " ") !== value
  ) {
    throw new Error(`无效下单时间：${value}`);
  }
  return value;
}

export function parseOrderId(value: string): string {
  if (!/^\d{6,30}$/.test(value)) {
    throw new Error(`无法识别订单号：${value || "空值"}`);
  }
  return value;
}

export class OrderLedger {
  readonly parents = new Map<string, ParentOrder>();
  readonly orders = new Map<string, Order>();
  readonly parentByChild = new Map<string, string>();
  private activeParent: ParentOrder | undefined;

  add(entries: Entry[]): void {
    for (const entry of entries) {
      if (entry.kind === "parent") {
        this.checkDuplicate(this.parents.get(entry.id), entry);
        this.parents.set(entry.id, entry);
        this.activeParent = entry;
        continue;
      }
      let parentId: string | undefined;
      if (entry.split) {
        if (
          !this.activeParent ||
          this.activeParent.placedAt !== entry.placedAt ||
          this.activeParent.currency !== entry.currency
        ) {
          throw new Error(
            `子订单 ${entry.id} 缺少明确的父订单，请从第一页重试`,
          );
        }
        parentId = this.activeParent.id;
        if (parentId === entry.id) {
          throw new Error(`订单 ${entry.id} 的父子订单号相同`);
        }
      } else {
        this.activeParent = undefined;
      }
      this.checkDuplicate(this.orders.get(entry.id), entry);
      if (
        this.orders.has(entry.id) &&
        this.parentByChild.get(entry.id) !== parentId
      ) {
        throw new Error(`订单 ${entry.id} 的拆单关系在分页间发生变化`);
      }
      this.orders.set(entry.id, entry);
      if (parentId) this.parentByChild.set(entry.id, parentId);
    }
  }

  private checkDuplicate(previous: Entry | undefined, next: Entry): void {
    if (previous && JSON.stringify(previous) !== JSON.stringify(next)) {
      throw new Error(`订单 ${next.id} 的内容在分页间发生变化，请重新导出`);
    }
  }
}
