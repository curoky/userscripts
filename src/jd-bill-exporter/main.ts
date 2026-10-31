import { collectPeriod, discoverPeriods } from "./exporter.js";
import type { Period } from "./order-page.js";
import css from "./style.css.txt";

function mount(): void {
  if (document.getElementById("jd-bill-exporter")) return;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const host = document.createElement("aside");
  host.id = "jd-bill-exporter";
  host.setAttribute("aria-label", "JD 年度账单导出");
  // 固定模板不拼接京东页面数据。
  host.innerHTML = `
    <details open>
      <summary>JD 年度账单导出</summary>
      <div class="jd-export-body">
        <label>导出年度 <select aria-label="导出年度"></select></label>
        <div class="jd-export-actions">
          <button type="button" data-action="years">读取可选年份</button>
          <button type="button" data-action="start">生成 CSV</button>
          <button type="button" data-action="cancel" disabled>取消</button>
        </div>
        <p class="jd-export-hint">自动读取全部分页，拆单保留父子关系。导出期间请保持此页打开。</p>
        <p class="jd-export-hint">汇总订单金额只计父单一次；含取消订单，未扣退款。</p>
        <p role="status" aria-live="polite">就绪</p>
        <div class="jd-export-downloads"></div>
      </div>
    </details>`;
  const select = host.querySelector("select");
  const years = host.querySelector<HTMLButtonElement>("[data-action='years']");
  const start = host.querySelector<HTMLButtonElement>("[data-action='start']");
  const cancel = host.querySelector<HTMLButtonElement>(
    "[data-action='cancel']",
  );
  const status = host.querySelector<HTMLElement>("[role='status']");
  const downloads = host.querySelector<HTMLElement>(".jd-export-downloads");
  if (!select || !years || !start || !cancel || !status || !downloads) return;
  const currentYear = new Date().getFullYear();
  select.add(new Option(`${currentYear} 年`, String(currentYear)));
  select.add(new Option("全部年份（每年一个文件）", "all"));
  let controller: AbortController | undefined;
  const urls: string[] = [];
  const report = (message: string) => {
    status.textContent = message;
  };
  const busy = (value: boolean) => {
    select.disabled = value;
    years.disabled = value;
    start.disabled = value;
    cancel.disabled = !value;
  };
  const populate = (periods: Period[]) => {
    const selected = select.value;
    select.replaceChildren(new Option("全部年份（每年一个文件）", "all"));
    for (const period of periods) {
      select.add(
        new Option(
          period.label,
          period.year === null ? "before" : String(period.year),
        ),
      );
    }
    select.value = selected;
    if (!select.value) select.value = String(currentYear);
  };
  const run = async (exportData: boolean) => {
    if (controller) return;
    controller = new AbortController();
    const signal = controller.signal;
    const selected = select.value;
    let completed = 0;
    let mismatches = 0;
    busy(true);
    report("正在读取京东年度筛选…");
    try {
      const periods = await discoverPeriods(signal);
      populate(periods);
      if (!exportData) {
        report("可选年份已更新");
        return;
      }
      const queue = periods.filter(
        (period) =>
          selected === "all" ||
          (selected === "before"
            ? period.before !== null
            : period.year === Number(selected)),
      );
      if (!queue.length)
        throw new Error("京东未提供所选年份，请读取可选年份后重试");
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
      downloads.replaceChildren();
      for (const period of queue) {
        const files = await collectPeriod(period, signal, (message) =>
          report(
            `${completed ? `已生成 ${completed} 个年度文件。` : ""}${message}`,
          ),
        );
        signal.throwIfAborted();
        for (const file of files) {
          const url = URL.createObjectURL(
            new Blob([file.csv], { type: "text/csv;charset=utf-8" }),
          );
          urls.push(url);
          const link = document.createElement("a");
          link.href = url;
          link.download = `jd-orders-${file.year}.csv`;
          link.textContent = `下载 ${file.year} CSV（${file.orders} 单，${file.splitGroups} 组拆单${file.mismatches ? `，${file.mismatches} 组金额待核对` : ""}）`;
          downloads.append(link);
          completed++;
          mismatches += file.mismatches;
        }
      }
      report(
        completed
          ? `完成：${completed} 个年度文件，请点击下方链接下载${mismatches ? `；${mismatches} 组父子金额不一致，已在 CSV 标记` : ""}。`
          : "所选年度范围没有订单",
      );
    } catch (error) {
      const message = signal.aborted
        ? "已取消，当前未完成年度不会生成文件"
        : `导出停止：${error instanceof Error ? error.message : String(error)}`;
      report(
        `${message}${completed ? `；已完成的 ${completed} 个文件仍可下载` : ""}`,
      );
    } finally {
      controller = undefined;
      busy(false);
    }
  };
  years.addEventListener("click", () => void run(false));
  start.addEventListener("click", () => void run(true));
  cancel.addEventListener("click", () =>
    controller?.abort(new DOMException("用户取消", "AbortError")),
  );
  document.body.append(host);
}

mount();
