// ==UserScript==
// @name         JD Bill Exporter
// @namespace    https://github.com/curoky/userscripts
// @version      0.1.0
// @description  Export JD orders by year as CSV with explicit split-order relationships and deduplicated totals.
// @author       curoky
// @homepageURL  https://github.com/curoky/userscripts
// @supportURL   https://github.com/curoky/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/curoky/userscripts/master/dist/jd-bill-exporter.user.js
// @updateURL    https://raw.githubusercontent.com/curoky/userscripts/master/dist/jd-bill-exporter.user.js
// @match        https://order.jd.com/center/list.action*
// @match        https://order.jd.hk/center/list.action*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function() {

//#region src/jd-bill-exporter/csv.ts
	const headers = [
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
		"备注"
	];
	const note = "订单页展示金额，含取消及零元订单；未扣退款，不代表实际支付流水或净支出";
	const money = (cents) => (cents / 100).toFixed(2);
	function csvCell(value) {
		let leading = value.trimStart();
		while (leading && leading.charCodeAt(0) < 32) leading = leading.slice(1).trimStart();
		return `"${(/^[=+\-@]/.test(leading) || value.charCodeAt(0) < 32 ? `'${value}` : value).replaceAll("\"", "\"\"")}"`;
	}
	function orderRow(order, parentId = "") {
		const details = order.products.map((product) => `${product.name} × ${product.quantity}${product.sku ? ` [SKU:${product.sku}]` : ""}`).join("\n");
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
			note
		];
	}
	function exportYears(ledger) {
		const children = /* @__PURE__ */ new Map();
		for (const order of ledger.orders.values()) {
			const parentId = ledger.parentByChild.get(order.id);
			if (parentId) {
				const group = children.get(parentId) ?? [];
				group.push(order);
				children.set(parentId, group);
			}
		}
		const buckets = /* @__PURE__ */ new Map();
		const records = [...ledger.parents.values(), ...Array.from(ledger.orders.values()).filter((order) => !ledger.parentByChild.has(order.id))].sort((a, b) => b.placedAt.localeCompare(a.placedAt) || a.id.localeCompare(b.id));
		for (const record of records) {
			const year = Number(record.placedAt.slice(0, 4));
			const bucket = buckets.get(year) ?? {
				rows: [],
				orders: 0,
				splitGroups: 0,
				mismatches: 0
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
			const statuses = Array.from(new Set(group.map((child) => child.status))).join(" / ");
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
				matched ? note : `${note}；子单合计与父单金额不同，可能有取消、调整或页面遗漏，请核对拆单详情`
			]);
			for (const child of group) bucket.rows.push(orderRow(child, record.id));
			bucket.orders += group.length;
			bucket.splitGroups++;
			if (!matched) bucket.mismatches++;
		}
		return Array.from(buckets).sort(([a], [b]) => b - a).map(([year, bucket]) => ({
			year,
			csv: serializeCsv(bucket.rows),
			orders: bucket.orders,
			splitGroups: bucket.splitGroups,
			mismatches: bucket.mismatches
		}));
	}
	function serializeCsv(rows) {
		return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
	}

//#endregion
//#region src/jd-bill-exporter/orders.ts
	function parseMoney(value) {
		const normalized = value.replace(/[¥￥,\s]/g, "");
		if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`无法识别订单金额：${value || "空值"}`);
		const [integer = "", decimal = ""] = normalized.split(".");
		const cents = Number(integer) * 100 + Number(decimal.padEnd(2, "0"));
		if (!Number.isSafeInteger(cents)) throw new Error("订单金额超出有效范围");
		return cents;
	}
	function parseDate(value) {
		const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
		if (!match) throw new Error(`无法识别下单时间：${value || "空值"}`);
		const [, year, month, day, hour, minute, second] = match;
		const date = /* @__PURE__ */ new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
		if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19).replace("T", " ") !== value) throw new Error(`无效下单时间：${value}`);
		return value;
	}
	function parseOrderId(value) {
		if (!/^\d{6,30}$/.test(value)) throw new Error(`无法识别订单号：${value || "空值"}`);
		return value;
	}
	var OrderLedger = class {
		parents = /* @__PURE__ */ new Map();
		orders = /* @__PURE__ */ new Map();
		parentByChild = /* @__PURE__ */ new Map();
		activeParent;
		add(entries) {
			for (const entry of entries) {
				if (entry.kind === "parent") {
					this.checkDuplicate(this.parents.get(entry.id), entry);
					this.parents.set(entry.id, entry);
					this.activeParent = entry;
					continue;
				}
				let parentId;
				if (entry.split) {
					if (!this.activeParent || this.activeParent.placedAt !== entry.placedAt || this.activeParent.currency !== entry.currency) throw new Error(`子订单 ${entry.id} 缺少明确的父订单，请从第一页重试`);
					parentId = this.activeParent.id;
					if (parentId === entry.id) throw new Error(`订单 ${entry.id} 的父子订单号相同`);
				} else this.activeParent = void 0;
				this.checkDuplicate(this.orders.get(entry.id), entry);
				if (this.orders.has(entry.id) && this.parentByChild.get(entry.id) !== parentId) throw new Error(`订单 ${entry.id} 的拆单关系在分页间发生变化`);
				this.orders.set(entry.id, entry);
				if (parentId) this.parentByChild.set(entry.id, parentId);
			}
		}
		checkDuplicate(previous, next) {
			if (previous && JSON.stringify(previous) !== JSON.stringify(next)) throw new Error(`订单 ${next.id} 的内容在分页间发生变化，请重新导出`);
		}
	};

//#endregion
//#region src/jd-bill-exporter/order-page.ts
	const selectors = {
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
		search: "input[class*='input-']"
	};
	function requiredText(root, selector, label) {
		const value = root.querySelector(selector)?.textContent?.trim();
		if (!value) throw new Error(`京东页面缺少${label}，已停止导出`);
		return value;
	}
	function currency(root) {
		const symbol = requiredText(root, "[class*='priceSymbol-']", "金额币种");
		if (!["¥", "￥"].includes(symbol)) throw new Error(`尚不支持的订单币种：${symbol}`);
		return "CNY";
	}
	function products(card) {
		const items = Array.from(card.querySelectorAll("[class*='productItem-']")).map((item) => {
			const name = requiredText(item, "[class*='productTitle-']", "商品名称");
			const count = requiredText(item, "[class*='countNum-']", "商品数量");
			if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)) || Number(count) < 1) throw new Error(`无效商品数量：${count}`);
			const href = item.querySelector("a[class*='goodImg-']")?.getAttribute("href");
			let sku = "";
			if (href) {
				const url = new URL(href, "https://item.jd.com");
				if (url.hostname === "item.jd.com" || url.hostname === "item.jd.hk") sku = /^\/(\d+)\.html$/.exec(url.pathname)?.[1] ?? "";
			}
			return {
				name,
				quantity: Number(count),
				sku
			};
		});
		if (!items.length) throw new Error("订单商品列表为空，已停止导出");
		return items;
	}
	function readParent(banner) {
		const values = Array.from(banner.querySelectorAll("[class*='infoGroup-']"));
		const field = (label) => {
			const group = values.find((element) => element.querySelector("[class*='label-']")?.textContent?.trim() === label);
			if (!group) throw new Error(`京东拆单标题缺少${label}`);
			return requiredText(group, "[class*='value-']", label);
		};
		const money = field("订单金额");
		if (!/^[¥￥]/.test(money)) throw new Error("无法确认父订单金额币种");
		return {
			kind: "parent",
			id: parseOrderId(field("订单号")),
			placedAt: parseDate(requiredText(banner, "[class*='orderTimeValue-']", "父订单下单时间")),
			amount: parseMoney(money),
			currency: "CNY",
			reason: requiredText(banner, "[class*='noticeText-']", "拆单原因")
		};
	}
	function readPage(root = document) {
		const list = root.querySelector(selectors.list);
		if (!list) throw new Error("未找到京东新版订单列表，请确认登录并等待页面加载");
		const entries = [];
		for (const node of list.querySelectorAll(`${selectors.banner}, ${selectors.card}`)) {
			if (node.matches(selectors.banner)) {
				entries.push(readParent(node));
				continue;
			}
			entries.push({
				kind: "order",
				id: parseOrderId(requiredText(node, "[class*='orderMetas-'] [class*='metaValue-']", "订单号")),
				placedAt: parseDate(requiredText(node, "[class*='orderTime-']", "下单时间")),
				amount: parseMoney(requiredText(node, "[class*='priceRow-']", "订单金额")),
				currency: currency(node),
				split: !!node.querySelector("[class*='splitOrderHeader-']"),
				status: requiredText(node, "[class*='statusText-']", "订单状态"),
				shop: requiredText(node, "[class*='shopNames-']", "店铺名称"),
				payment: requiredText(node, "[class*='paymentTypeName-']", "支付方式"),
				products: products(node)
			});
		}
		const active = root.querySelector(selectors.activePage)?.textContent?.trim();
		const total = root.querySelector(selectors.totalPages)?.textContent?.trim();
		let page = Number(active);
		let totalPages = Number(/^共\s*(\d+)\s*页$/.exec(total ?? "")?.[1]);
		if (!entries.length) {
			const empty = list.querySelector("[class*='empty'], [class*='Empty']");
			if (!empty || !/暂无|没有|无订单/.test(empty.textContent ?? "")) throw new Error("无法确认列表已加载完毕或没有订单，已停止导出");
			page = 1;
			totalPages = 1;
		}
		if (!Number.isSafeInteger(page) || !Number.isSafeInteger(totalPages) || page < 1 || totalPages < page) throw new Error("无法识别京东分页信息，已停止导出");
		const period = requiredText(root.querySelector(selectors.menu) ?? root, selectors.selectedPeriod, "年度筛选");
		return {
			entries,
			page,
			totalPages,
			period,
			fingerprint: JSON.stringify({
				entries,
				page,
				totalPages,
				period
			})
		};
	}
	function assertAllOrders(root = document) {
		if (root.querySelector(`${selectors.status}[class*='selected-']`)?.textContent?.trim() !== "全部") throw new Error("请先将京东订单状态筛选切换为“全部”");
		if (root.querySelector(selectors.search)?.value.trim()) throw new Error("请先清空京东订单搜索条件");
	}
	function parsePeriods(labels, currentYear) {
		const periods = [];
		for (const label of new Set(labels)) {
			if (label === "今年内订单") {
				periods.push({
					label,
					year: currentYear,
					before: null
				});
				continue;
			}
			const year = /^(\d{4})年订单$/.exec(label);
			const before = /^(\d{4})前订单$/.exec(label);
			if (year) periods.push({
				label,
				year: Number(year[1]),
				before: null
			});
			if (before) periods.push({
				label,
				year: null,
				before: Number(before[1])
			});
		}
		if (!periods.length) throw new Error("未找到按年筛选的订单选项");
		return periods;
	}

//#endregion
//#region src/jd-bill-exporter/exporter.ts
	function checkSignal(signal) {
		signal.throwIfAborted();
	}
	async function waitFor(read, signal, stableMs = 0) {
		return new Promise((resolve, reject) => {
			let key = "";
			let stableSince = 0;
			let lastError = "京东页面未响应";
			const started = performance.now();
			const finish = (error, value) => {
				clearInterval(timer);
				signal.removeEventListener("abort", abort);
				if (error) reject(error);
				else resolve(value);
			};
			const abort = () => finish(signal.reason);
			const tick = () => {
				if (performance.now() - started > 3e4) {
					finish(/* @__PURE__ */ new Error(`等待订单页超时：${lastError}。请检查登录、验证提示后重试`));
					return;
				}
				try {
					checkSignal(signal);
					const value = read();
					if (value === void 0) {
						key = "";
						return;
					}
					if (stableMs === 0) {
						finish(void 0, value);
						return;
					}
					const nextKey = JSON.stringify(value);
					if (key !== nextKey) {
						key = nextKey;
						stableSince = performance.now();
					}
					if (performance.now() - stableSince >= stableMs) finish(void 0, value);
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
	function menu() {
		const element = document.querySelector(selectors.menu);
		if (!element) throw new Error("未找到京东订单年度筛选菜单");
		return element;
	}
	async function openMenu(signal) {
		let options = Array.from(menu().querySelectorAll(selectors.periodOption));
		if (!options.length) {
			menu().querySelector(selectors.selectedPeriod)?.click();
			options = await waitFor(() => {
				const items = Array.from(menu().querySelectorAll(selectors.periodOption));
				return items.length ? items : void 0;
			}, signal);
		}
		return options;
	}
	async function discoverPeriods(signal) {
		assertAllOrders();
		const options = await openMenu(signal);
		const periods = parsePeriods(options.map((option) => option.textContent?.trim() ?? ""), (/* @__PURE__ */ new Date()).getFullYear());
		menu().querySelector(selectors.selectedPeriod)?.click();
		return periods;
	}
	async function changePage(action, accept, signal) {
		checkSignal(signal);
		const started = performance.now();
		let requestComplete = false;
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const url = new URL(entry.name, location.href);
				if (entry.startTime >= started && ["color.jd.com", "color.jd.hk"].includes(url.hostname) && url.searchParams.get("functionId") === "pcorder_center_list") requestComplete = true;
			}
		});
		observer.observe({ type: "resource" });
		try {
			action();
			return await waitFor(() => {
				assertAllOrders();
				if (!requestComplete) return void 0;
				const snapshot = readPage();
				return accept(snapshot) ? snapshot : void 0;
			}, signal, 350);
		} finally {
			observer.disconnect();
		}
	}
	async function firstPage(period, signal) {
		const current = await waitFor(() => {
			assertAllOrders();
			return readPage();
		}, signal, 350);
		if (current.period !== period.label) {
			const option = (await openMenu(signal)).find((item) => item.textContent?.trim() === period.label);
			if (!option) throw new Error(`京东未提供年度筛选：${period.label}`);
			return changePage(() => option.click(), (snapshot) => snapshot.period === period.label && snapshot.page === 1, signal);
		}
		if (current.page === 1) return current;
		const one = Array.from(document.querySelectorAll(selectors.page)).find((item) => item.textContent?.trim() === "1");
		if (!one) throw new Error("未找到第一页按钮，请手动返回第一页后重试");
		return changePage(() => one.click(), (snapshot) => snapshot.page === 1 && snapshot.period === period.label, signal);
	}
	function validateYear(snapshot, period) {
		for (const entry of snapshot.entries) {
			const year = Number(entry.placedAt.slice(0, 4));
			if (period.year !== null && year !== period.year || period.before !== null && year >= period.before) throw new Error(`年度筛选与订单 ${entry.id} 的下单年份不符，已停止导出`);
		}
	}
	async function collectPeriod(period, signal, progress) {
		const ledger = new OrderLedger();
		let snapshot = await firstPage(period, signal);
		const totalPages = snapshot.totalPages;
		const visited = /* @__PURE__ */ new Set();
		for (let page = 1; page <= totalPages; page++) {
			checkSignal(signal);
			assertAllOrders();
			if (snapshot.page !== page || snapshot.totalPages !== totalPages || snapshot.period !== period.label) throw new Error("订单筛选或总页数在导出期间发生变化，请重新导出");
			validateYear(snapshot, period);
			const ids = snapshot.entries.map((entry) => `${entry.kind}:${entry.id}`).join("|");
			if (visited.has(ids)) throw new Error("京东返回了重复订单页，已停止导出");
			visited.add(ids);
			ledger.add(snapshot.entries);
			progress(`${period.label}：第 ${page}/${totalPages} 页，已读取 ${ledger.orders.size} 个订单`);
			if (page === totalPages) break;
			const next = document.querySelector(selectors.next);
			if (!next || next.disabled) throw new Error("尚未到最后一页，但下一页按钮不可用");
			snapshot = await changePage(() => next.click(), (result) => result.page === page + 1 && result.period === period.label, signal);
		}
		const files = exportYears(ledger);
		if (!files.length && period.year !== null) return [{
			year: period.year,
			csv: serializeCsv([]),
			orders: 0,
			splitGroups: 0,
			mismatches: 0
		}];
		return files;
	}

//#endregion
//#region src/jd-bill-exporter/style.css.txt
	var style_css_default = "/* Bundled as a text asset into the single userscript. */\n#jd-bill-exporter {\n  position: fixed;\n  right: 20px;\n  bottom: 20px;\n  z-index: 99999;\n  width: min(370px, calc(100vw - 40px));\n  color: #222;\n  background: #fff;\n  border: 1px solid #ddd;\n  border-radius: 10px;\n  box-shadow: 0 5px 24px #0002;\n  font:\n    14px / 1.6 system-ui,\n    sans-serif;\n}\n\n#jd-bill-exporter summary {\n  padding: 10px 14px;\n  font-weight: 700;\n  cursor: pointer;\n}\n\n#jd-bill-exporter .jd-export-body {\n  padding: 0 14px 14px;\n}\n\n#jd-bill-exporter select {\n  width: 100%;\n  margin: 4px 0 10px;\n  padding: 6px;\n  color: #222;\n  background: #fff;\n  border: 1px solid #bbb;\n  border-radius: 4px;\n}\n\n#jd-bill-exporter .jd-export-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n#jd-bill-exporter button {\n  padding: 5px 9px;\n  color: #222;\n  background: #fafafa;\n  border: 1px solid #bbb;\n  border-radius: 4px;\n  cursor: pointer;\n}\n\n#jd-bill-exporter button[data-action=\"start\"] {\n  color: white;\n  background: #c92324;\n  border-color: #c92324;\n}\n\n#jd-bill-exporter button:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n\n#jd-bill-exporter p {\n  margin: 8px 0;\n}\n\n#jd-bill-exporter .jd-export-hint {\n  color: #666;\n  font-size: 12px;\n}\n\n#jd-bill-exporter .jd-export-downloads {\n  display: grid;\n  gap: 6px;\n  max-height: 180px;\n  overflow: auto;\n}\n\n#jd-bill-exporter a {\n  color: #a31617;\n  text-decoration: underline;\n}\n";

//#endregion
//#region src/jd-bill-exporter/main.ts
	function mount() {
		if (document.getElementById("jd-bill-exporter")) return;
		const style = document.createElement("style");
		style.textContent = style_css_default;
		document.head.append(style);
		const host = document.createElement("aside");
		host.id = "jd-bill-exporter";
		host.setAttribute("aria-label", "JD 年度账单导出");
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
		const years = host.querySelector("[data-action='years']");
		const start = host.querySelector("[data-action='start']");
		const cancel = host.querySelector("[data-action='cancel']");
		const status = host.querySelector("[role='status']");
		const downloads = host.querySelector(".jd-export-downloads");
		if (!select || !years || !start || !cancel || !status || !downloads) return;
		const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
		select.add(new Option(`${currentYear} 年`, String(currentYear)));
		select.add(new Option("全部年份（每年一个文件）", "all"));
		let controller;
		const urls = [];
		const report = (message) => {
			status.textContent = message;
		};
		const busy = (value) => {
			select.disabled = value;
			years.disabled = value;
			start.disabled = value;
			cancel.disabled = !value;
		};
		const populate = (periods) => {
			const selected = select.value;
			select.replaceChildren(new Option("全部年份（每年一个文件）", "all"));
			for (const period of periods) select.add(new Option(period.label, period.year === null ? "before" : String(period.year)));
			select.value = selected;
			if (!select.value) select.value = String(currentYear);
		};
		const run = async (exportData) => {
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
				const queue = periods.filter((period) => selected === "all" || (selected === "before" ? period.before !== null : period.year === Number(selected)));
				if (!queue.length) throw new Error("京东未提供所选年份，请读取可选年份后重试");
				for (const url of urls) URL.revokeObjectURL(url);
				urls.length = 0;
				downloads.replaceChildren();
				for (const period of queue) {
					const files = await collectPeriod(period, signal, (message) => report(`${completed ? `已生成 ${completed} 个年度文件。` : ""}${message}`));
					signal.throwIfAborted();
					for (const file of files) {
						const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv;charset=utf-8" }));
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
				report(completed ? `完成：${completed} 个年度文件，请点击下方链接下载${mismatches ? `；${mismatches} 组父子金额不一致，已在 CSV 标记` : ""}。` : "所选年度范围没有订单");
			} catch (error) {
				const message = signal.aborted ? "已取消，当前未完成年度不会生成文件" : `导出停止：${error instanceof Error ? error.message : String(error)}`;
				report(`${message}${completed ? `；已完成的 ${completed} 个文件仍可下载` : ""}`);
			} finally {
				controller = void 0;
				busy(false);
			}
		};
		years.addEventListener("click", () => void run(false));
		start.addEventListener("click", () => void run(true));
		cancel.addEventListener("click", () => controller?.abort(new DOMException("用户取消", "AbortError")));
		document.body.append(host);
	}
	mount();

//#endregion
})();