# KisekiOrb

《空之轨迹 the 2nd》本地导力器（Orbment）与魔法（Arts）约束求解器。

## 本地运行

需要 Node.js 22+ 与 pnpm：

```bash
cd webapp
pnpm install
pnpm dev
```

打开终端中显示的 `http://localhost:3000/`。所有游戏数据与玩家状态均保存在当前浏览器的 `localStorage`，不需要账号或网络服务。

## 校验

```bash
cd webapp
pnpm test
pnpm lint
pnpm build
```

内置的是用于验证框架和求解器的示例数据；可在「游戏数据」页面编辑，或通过 JSON 导入完整游戏数据库。库存、商店状态和角色当前槽位等级与基础数据库分开存储。
