# GitHub Trending Language Priorities

## Purpose

本脚本将常用编程语言移动到 GitHub Trending 的 `Language` 菜单顶部，减少在完整语言列表中的查找成本。优先级固定为：

```text
Python → C++ → Go → Rust → TypeScript → JavaScript
```

未列出的语言保持 GitHub 原有相对顺序。脚本只调整现有 DOM 节点，不复制链接、不修改 URL，也不保存任何数据。

## Module boundaries

- `main.ts`：响应首次加载及 GitHub PJAX、Turbo、History 导航事件。
- `trending-language-menu.ts`：定位并重排语言菜单，是唯一接触 GitHub DOM 的模块。
- `trending-language-menu.test.ts`：验证排序、缺失选项和幂等性。
- `userscript.config.ts`：本脚本 metadata、入口和构建输出的唯一来源。

脚本没有配置和持久化需求，不得引入 GM storage 或网络请求。只有产品明确要求用户自定义优先级时，才重新评估配置 UI 与存储。

## GitHub integration

- 菜单容器选择器为 `#select-menu-language [data-filter-list]`。
- 语言名称来自选项内的 `[data-menu-button-text]`，比较前去除首尾空白。
- 直接移动原 `<a>` 元素，以保留 GitHub 的 PJAX、filter-list、ARIA 和选中状态。
- 页面增强必须幂等；GitHub 缺少某个优先语言时跳过该项，不影响其他选项。
- GitHub DOM 不是稳定 API；修改选择器时同步更新测试，并用当前线上 HTML 做 smoke test。

## Release checklist

1. 行为变化时更新 `userscript.config.ts` 中的 `@version`。
2. 运行 `pnpm format` 和 `pnpm check`。
3. 检查 `dist/github-trending-language-priorities.user.js` 的 metadata、权限与目标 URL。
4. 提交源码、测试、文档和构建产物。
