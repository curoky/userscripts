# Userscripts Agent Guide

## Project scope

本仓库保存可直接安装到 Violentmonkey 的 userscript。源码使用 TypeScript，`dist/` 保存构建后的单文件安装产物。保持每个脚本职责单一，不引入运行时依赖，优先使用浏览器、GitHub 页面和 Violentmonkey 已提供的能力。

当前脚本：

| Script                    | Source                           | Output                                   | Match                                                    |
| ------------------------- | -------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| GitHub Trending Blacklist | `src/github-trending-blacklist/` | `dist/github-trending-blacklist.user.js` | `https://github.com/trending*`，运行时只处理 `/trending` |

## Commands

- `pnpm install --frozen-lockfile`：严格按锁文件安装依赖。
- `pnpm format`：用 Biome 格式化并修复可自动修复的问题。
- `pnpm lint`：检查格式与 lint。
- `pnpm typecheck`：运行严格 TypeScript 类型检查。
- `pnpm test:run`：运行 Vitest 测试。
- `pnpm build`：构建所有 userscript 到 `dist/`。
- `pnpm check`：依次执行 lint、类型检查、测试和构建；提交前必须通过。

开发基线固定为 Node.js 24.21.0 和 pnpm 12.14.0。不要静默改动版本；升级工具链时同步更新 `.nvmrc`、`package.json`、lockfile 和 CI。

## Repository structure

- `src/<script-name>/main.ts`：脚本入口，只负责运行时编排。
- `src/<script-name>/*.ts`：领域逻辑与 DOM UI；测试与源码放在同目录。
- `tsdown.config.ts`：构建入口和 userscript metadata 的唯一来源。
- `dist/*.user.js`：可安装产物，必须提交，以支持 raw URL 安装和自动更新。
- `.github/workflows/ci.yml`：复用 `pnpm check`，并验证 `dist/` 没有过期。

不要新增 README；面向 agent 的长期上下文写在本文件，某一脚本的设计内容过大时拆到该脚本目录下的 `DESIGN.md`，并在这里添加索引。

## Userscript conventions

- 每个脚本使用独立目录、构建入口和 `.user.js` 输出；不要让脚本之间隐式共享状态。
- metadata 的 `@match` 和 `@grant` 保持最小范围。新增 privileged API 时必须显式增加对应 `@grant`。
- `@name` 与 `@namespace` 是稳定身份，也是持久化数据归属的一部分。发布后未经明确的破坏性变更决定，不得修改。
- 当前 metadata `@version` 是脚本版本的唯一来源。行为变更时按 SemVer 更新，并重新构建、提交 `dist/`。
- GitHub DOM 不是稳定 API。选择器优先依赖语义结构或 GitHub 长期使用的 Primer class，并为关键页面片段写 DOM 测试。
- GitHub 部分导航使用 PJAX/Turbo。增强逻辑必须幂等，并在页面切换事件后可以重新执行。
- 不使用远程代码、外部 CDN 或 `eval`。除非功能明确需要，不新增网络请求与 `@connect`。
- 页面与脚本存储中的数据都视为外部输入；先验证、标准化，再进入内部逻辑。

## GitHub Trending blacklist storage

黑名单使用 Violentmonkey 的脚本级 value storage，不使用 `localStorage`、Cookie 或 IndexedDB：

```json
{
  "version": 1,
  "repositories": ["owner/repository"]
}
```

- key 固定为 `github-trending-blacklist`。
- repository slug 一律转为小写，因为 GitHub owner/repository 路径不区分大小写。
- 整个对象通过 `GM_setValue` 原子写入；读取时验证 schema，非法或未知版本按空列表处理，不做猜测性迁移。
- `GM_addValueChangeListener` 用于同步同一浏览器内其他标签页的远程变更。
- 选择 GM storage 的原因：数据与 GitHub 页面隔离，页面脚本无法直接读写，且不会绑定 github.com 的站点存储生命周期。`localStorage` 虽简单，但会暴露给页面并随站点数据清理；IndexedDB 对这个小型集合没有收益。
- 该存储仍属于 Violentmonkey 和当前脚本。跨浏览器同步、扩展备份与恢复由用户的 Violentmonkey 配置决定，本项目不实现账号或远端同步。

当前只按 repository slug 屏蔽。仓库重命名后旧记录不会自动跟随，这是刻意选择：页面稳定提供 slug，而依赖 GitHub 内部埋点提取 numeric repository ID 会显著增加脆弱性。

## Change workflow

1. 修改源码和就近测试。
2. 若用户可见行为变化，更新 `tsdown.config.ts` 中对应脚本的 `@version`。
3. 运行 `pnpm format`，再运行 `pnpm check`。
4. 检查生成的 `.user.js` metadata、目标 URL 和权限。
5. 提交源码、测试与对应 `dist/` 产物。

Commit message 使用 Conventional Commits，英文祈使句；除极小改动外，body 解释原因与关键取舍。不得添加 `Co-authored-by` trailer。
