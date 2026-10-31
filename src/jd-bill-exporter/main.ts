import { collectCurrentPeriod } from "./exporter.js";
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
        <div class="jd-export-actions">
          <button type="button" data-action="start">导出当前年度 CSV</button>
          <button type="button" data-action="cancel" disabled>取消</button>
        </div>
        <p class="jd-export-hint">先在京东页面选择年度并回到第一页。脚本自动翻页，保留拆单父子关系。</p>
        <p class="jd-export-hint">汇总订单金额只计父单一次；含取消订单，未扣退款。</p>
        <p role="status" aria-live="polite">就绪</p>
        <div class="jd-export-downloads"></div>
      </div>
    </details>`;
  const start = host.querySelector<HTMLButtonElement>("[data-action='start']");
  const cancel = host.querySelector<HTMLButtonElement>(
    "[data-action='cancel']",
  );
  const status = host.querySelector<HTMLElement>("[role='status']");
  const downloads = host.querySelector<HTMLElement>(".jd-export-downloads");
  if (!start || !cancel || !status || !downloads) return;
  let controller: AbortController | undefined;
  const urls: string[] = [];
  const report = (message: string) => {
    status.textContent = message;
  };
  const busy = (value: boolean) => {
    start.disabled = value;
    cancel.disabled = !value;
  };
  const run = async () => {
    if (controller) return;
    controller = new AbortController();
    const signal = controller.signal;
    busy(true);
    report("正在读取当前年度订单…");
    try {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
      downloads.replaceChildren();
      const files = await collectCurrentPeriod(signal, report);
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
      }
      const mismatches = files.reduce((sum, file) => sum + file.mismatches, 0);
      report(
        files.length
          ? `完成，请点击下方链接下载${mismatches ? `；${mismatches} 组父子金额不一致，已在 CSV 标记` : ""}。`
          : "当前筛选没有订单",
      );
    } catch (error) {
      const message = signal.aborted
        ? "已取消，当前未完成年度不会生成文件"
        : `导出停止：${error instanceof Error ? error.message : String(error)}`;
      report(message);
    } finally {
      controller = undefined;
      busy(false);
    }
  };
  start.addEventListener("click", () => void run());
  cancel.addEventListener("click", () =>
    controller?.abort(new DOMException("用户取消", "AbortError")),
  );
  document.body.append(host);
}

mount();
