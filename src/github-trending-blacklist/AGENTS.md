# GitHub Trending Blacklist

## Purpose

本脚本在 `https://github.com/trending` 及 `/trending/<language>` 的每个 repository 卡片上增加 `Block`，并提供查看、逐项恢复和清空黑名单的入口。功能只处理 repository Trending，不处理 `/trending/developers`。

## Module boundaries

- `main.ts`：组合存储与页面适配，持有当前黑名单状态，并响应 PJAX、Turbo、History 和远程存储事件。
- `blacklist.ts`：纯领域逻辑，负责 repository slug 标准化以及黑名单 schema 的验证和序列化。
- `storage.ts`：唯一接触 Violentmonkey `GM_*Value` API 的模块。
- `trending-page.ts`：唯一接触 GitHub DOM 的模块；通过 action callbacks 上报用户操作，不感知存储。
- `userscript.config.ts`：本脚本 metadata、入口和构建输出的唯一来源。
- `*.test.ts`：与被测模块就近放置，只验证可观察行为。

依赖方向固定为：

```text
userscript.config -> main -> storage -> blacklist
                         -> trending-page -> blacklist
```

不要让 DOM 模块调用 GM API，也不要让存储模块访问 DOM。只有出现第二个真实消费者时才提取跨脚本共享代码。

## Storage

黑名单保存在 Violentmonkey 的脚本级 value storage，key 为 `github-trending-blacklist`：

```json
{
  "version": 1,
  "repositories": ["owner/repository"]
}
```

- repository slug 统一转为小写并去重。
- 整个对象通过 `GM_setValue` 原子写入；非法数据或未知 schema version 按空集合处理。
- `GM_addValueChangeListener` 只接收其他标签页的远程变更。
- 不使用 `localStorage`：它暴露给 GitHub 页面，并绑定站点数据生命周期。
- 不使用 IndexedDB：该集合很小，引入异步数据库没有收益。
- 不依赖 GitHub 内部埋点获取 numeric repository ID。repository 重命名后旧记录不会跟随，以换取对公开 URL 结构的稳定依赖。

数据属于当前 Violentmonkey 脚本；跨浏览器同步、扩展备份与恢复由用户的 Violentmonkey 配置负责。

## GitHub integration

- repository 卡片选择器为 `article.Box-row`，仓库链接来自 `h2 a[href]`。
- 页面范围只包含 `/trending` 和 `/trending/<language>`，明确排除 `/trending/developers`。
- 控件复用 GitHub Primer class，脚本只增加必要的行内布局属性。
- 页面增强必须幂等，重复执行不能产生重复按钮或管理器。
- GitHub DOM 不是稳定 API；修改选择器时同步更新 `trending-page.test.ts`，并用当前线上 HTML 做 smoke test。

## Release checklist

1. 行为变化时更新 `userscript.config.ts` 中的 `@version`。
2. 运行 `pnpm format` 和 `pnpm check`。
3. 检查 `dist/github-trending-blacklist.user.js` 的 metadata、权限与目标 URL。
4. 提交源码、测试、文档和构建产物。
