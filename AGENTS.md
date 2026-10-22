# Userscripts Agent Guide

## Scope

本仓库保存可直接安装到 Violentmonkey 的 userscript。源码使用 TypeScript，构建后的单文件安装产物保存在 `dist/` 并提交到 Git。

## Script index

- [GitHub Trending Blacklist](src/github-trending-blacklist/AGENTS.md)：隐藏 GitHub Trending 中不想再看到的 repository。
- [GitHub Trending Language Priorities](src/github-trending-language-priorities/AGENTS.md)：将常用编程语言移动到 GitHub Trending 语言菜单顶部。

## Commands

- `pnpm install --frozen-lockfile`：严格按锁文件安装依赖。
- `pnpm format`：格式化并修复可自动修复的问题。
- `pnpm lint`：检查格式与 lint。
- `pnpm typecheck`：运行严格 TypeScript 类型检查。
- `pnpm test`：运行全部测试。
- `pnpm build`：构建所有 userscript 到 `dist/`。
- `pnpm check`：依次运行 lint、类型检查、测试和构建；提交前必须通过。

开发基线固定为 Node.js 24.21.0 和 pnpm 12.14.0。升级时同步更新 `.nvmrc`、`package.json`、lockfile 和 CI。

## Boundaries

- 一个脚本的源码、测试、metadata、构建配置和设计文档必须放在同一个 `src/<script-name>/` 目录。
- 根 `tsdown.config.ts` 只登记脚本构建配置，不保存任何脚本细节。
- 根目录只保存跨脚本工具链与治理配置，不保存业务逻辑。
- 不为尚不存在的第二个消费者提取共享模块；确有重复时再提取，并为共享模块建立明确接口和独立文档。
- `dist/*.user.js` 是生成产物。修改源码后运行 `pnpm build` 并一起提交。
- 不新增 README。项目级约定写在本文件，脚本级上下文写在对应目录的 `AGENTS.md`。

## Repository conventions

- metadata 的 `@match` 和 `@grant` 保持最小范围；`@name` 与 `@namespace` 发布后保持稳定。
- metadata 中的 `@version` 是各脚本版本的唯一来源，按 SemVer 更新。
- 不使用远程代码、外部 CDN 或 `eval`；除非功能明确需要，不新增网络请求与 `@connect`。
- 页面与存储数据都视为外部输入，验证后再进入领域逻辑。
- Commit message 使用英文 Conventional Commits，不得添加 `Co-authored-by` trailer。
