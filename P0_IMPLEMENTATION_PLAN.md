# P0 实现计划：能力评估 + 商店介绍页重构

## Summary

P0 拆成两个可独立交付的增量：先让新用户在首次使用时完成 2 分钟内的水平校准，并把结果用于后续“哪些词应该进入学习”的阈值；同时重写 Chrome Web Store 介绍材料，让用户 3 秒内理解 TransLens 的核心动线。P0 只做“个性化基座”和“转化表达”，不实现右键菜单、免费翻译引擎、闪卡复习和导入功能。

## Key Changes

- 新增首次使用 onboarding：安装后或首次打开设置页时展示 3 步向导，顺序为“选择学习语言 -> 快速水平评估 -> 保存并开始浏览”。
- 能力评估采用 P0 推荐方案：自评 + 快速词汇识别混合估算，避免引入复杂 Lexile 正式测评。
- 英语作为 P0 首个完整支持语言：新增 `en` 作为 source language，水平输出映射到 `A1/A2/B1/B2/C1` 和近似词汇量区间。
- 非英语语言 P0 先支持手动水平标记，不做自动词汇量测试；后续语言测试题库作为 P1/P2 扩展。
- 新增用户水平配置字段，保存在 `chrome.storage.local.settings`：
  - `onboardingCompleted: boolean`
  - `learnerLevel: "A1" | "A2" | "B1" | "B2" | "C1"`
  - `estimatedVocabulary: number`
  - `levelSource: "quiz" | "manual"`
- 建立“用户水平 -> 生词阈值”的第一版规则：
  - 页面候选词如果低于或等于用户水平，默认少标注或不作为新词推荐。
  - 高于用户水平 1 档的词优先进入自动标注候选。
  - 已在 SRS 数据中、到期复习的词仍优先展示，不受水平阈值过滤。
- 词频/难度数据 P0 使用内置静态小表：覆盖英语高频词等级映射，未知词默认按中高难度处理，避免依赖远程服务。
- 设置页增加“我的水平”区域，允许用户重新测试或手动调整等级；调整后影响之后的新页面扫描，不强制迁移已有 SRS 数据。
- 商店介绍页重构落在 `审核材料/CWS-SUBMISSION.md` 和 README 文案：
  - 3 秒价值主张：`Browse foreign-language pages. TransLens highlights words worth learning, translates them in context, and schedules review.`
  - 中文版：`边浏览网页边学外语：自动标出适合你水平的生词，语境翻译，并进入间隔复习。`
  - 增加 4 步核心流程图文案：`测水平 -> 浏览网页 -> 标注生词 -> 复习巩固`。
  - FAQ 增加：是否需要导入生词库、是否需要 API Key、数据存哪里、为什么要读取网页文本。
  - 截图/GIF 规划为 3 张：首次水平评估、网页标注效果、设置页/学习数据。

## Implementation Notes

- 主要修改位置控制在现有无构建链结构内：`translate/settings.html/js/css` 承载 onboarding 和水平设置，`translate/content.js` 使用水平阈值过滤候选词，`审核材料/CWS-SUBMISSION.md` 更新商店文案。
- 快速测试题 P0 采用 12 题左右词汇识别：每题展示一个英文词，用户选择“认识 / 不确定 / 不认识”；按命中词的等级分布估算 CEFR 和词汇量。
- 词汇等级表以新增静态 JS 常量形式放在 settings/content 可共用位置；如果不引入构建系统，就复制同一份最小映射或新增一个普通脚本文件并在设置页引用。
- onboarding 不阻塞老用户：已有 `settings` 且无 `onboardingCompleted` 时，设置默认值并在设置页顶部提示“完成水平校准可改善标注”，不强弹。
- P0 不宣称正式 Lexile/Star 分数，只使用“近似等级/词汇量估算”，避免教育测评准确性风险。

## Test Plan

- 首次安装后打开设置页，能看到 onboarding；完成后 `settings.onboardingCompleted`、`learnerLevel`、`estimatedVocabulary` 正确写入。
- 选择 English 作为 source language 后，英文页面能被扫描并标注；低于用户等级的简单词明显减少，高于等级的词仍会进入候选。
- 手动调整等级后刷新网页，标注密度和候选词难度随等级变化。
- 已缓存或到期复习词仍按 SRS 逻辑出现，不被新水平过滤误伤。
- 旧版 settings 能正常迁移，不丢 provider、API key、语言、disabledSites 和 SRS 数据。
- 设置页 Test Connection、导出、清除学习数据、禁用站点功能保持可用。
- 商店文案满足 Chrome Web Store 字段长度限制，隐私描述与实际权限和数据流一致。

## Assumptions

- P0 的能力评估优先服务“学英语”的场景；其他语言先提供手动等级，自动测评后续扩展。
- P0 不接入官方 Lexile/Star API，也不输出官方认证分数。
- P0 不实现真正 FSRS 算法替换；沿用当前 SM-2/SRS 数据结构，只把“加入学习门槛”接到用户水平上。
- P0 不新增后端服务，不引入构建系统，继续保持纯前端 Chrome 扩展形态。
