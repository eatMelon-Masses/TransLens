# TransLens

> 在浏览网页时自然地学习语言。用 AI 翻译 + 间隔重复（SRS）帮你积累词汇。

**纯前端 Chrome 扩展，无需后端，代码即文档。**

## 截图

| | | |
|---|---|---|
| ![Screenshot 1](https://lh3.googleusercontent.com/p0hytvmqgw17_c0nLcBkNy7VxwH2TrHc8RJK4ics_PIJUHBPtt0VHwc8cGkxaX_uwsjlM7couxaHYFWWzCaUq17Tmg=s1600-w1600-h1000) | ![Screenshot 2](https://lh3.googleusercontent.com/XxXFxUvUoj_T6nqnFkFa4B_lyBTcvFZ_peGlwYJ5EGt9Fhnq1drjeWgI6yjGaU4ez9hJOY_XJpXtHP9IKcWVqbG8zfY=s1600-w1600-h1000) | ![Screenshot 3](https://lh3.googleusercontent.com/AVw2c5obBw2KnTlzlb7ZH8OMdgeg5XVenkq7SNKJ7kXgu2qhMcX-7k9oE6csxxrDGu0EYv9YbslcAB4yy9JSri09uQ=s1600-w1600-h1000) |

## 功能

- **语境学习**：自动检测网页外语文本，内联标注翻译，支持中/日/韩/法/德/西/俄/阿拉伯文
- **间隔重复（SRS）**：内置 SM-2 算法，在遗忘前提醒复习，跟踪掌握程度
- **AI 翻译**：支持 OpenAI、Anthropic 及任意 OpenAI 兼容端点（DeepSeek、豆包、MiniMax、Ollama 等）
- **隐私优先**：所有数据存储在浏览器本地，无追踪、无分析
- **高度可定制**：选择语言、调整选词比例、每日新词上限、按站点禁用（支持通配符）
- **数据管理**：导出词汇表 CSV，清除学习数据时保留设置
- **智能跳过**：自动跳过搜索框和表单输入，不干扰用户操作

## 快速开始

```
1. chrome://extensions/
2. 打开「开发者模式」
3. 点击「加载已解压的扩展程序」→ 选择 translate/ 文件夹
4. 访问外语网站，即可看到效果
```

修改代码后，在扩展管理页点击刷新按钮即可，无需重新编译。

### 配置 AI 接口

选择「自定义（OpenAI 兼容）」后可填入任意兼容端点，以下为已验证可用的服务：

| 服务 | 端点 | 说明 |
|------|------|------|
| **DeepSeek** | `https://api.deepseek.com/v1/chat/completions` | 性价比高，中文能力强 |
| **豆包（Doubao）** | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | 字节火山引擎，中文场景表现优秀 |
| **MiniMax** | `https://api.minimaxi.com/v1/chat/completions` | 支持思考模型，已兼容 `` 解析 |
| **OneAPI 中转站** | 各中转站地址不同 | 统一 OpenAI 格式，填入中转站提供的地址和 Key 即可 |
| **Ollama（本地）** | `http://localhost:11434/v1/chat/completions` | 默认值，无需联网 |

> 如果你测试过其他接口，欢迎提 PR 补充到这张表里！

## 下载

- **正式版**：[Releases](https://github.com/eatMelon-Masses/TransLens/releases) — 稳定版本，手动打 tag 触发打包
- **快照版**：[Snapshot](https://github.com/eatMelon-Masses/TransLens/releases/tag/snapshot) — 每次 push 到 main 自动构建的最新开发版（带时间戳，可追溯）

## 项目结构

```
translate/
├── manifest.json      # 扩展配置
├── background.js      # Service Worker — AI 接口调用
├── content.js         # Content Script — DOM 提取、SRS、注释
├── popup.html / js    # 弹窗（开关、状态）
├── settings.html / js # 设置页（API Key、语言、SRS 参数等）
├── _locales/          # 国际化（中/英）
└── package.sh         # 打包脚本
```

## 参与维护

流程从简，欢迎任何人提 PR：

1. **Fork** 本仓库
2. 本地修改代码，在 Chrome 里加载 `translate/` 验证效果
3. 提交 **Pull Request**，简单说明改了什么

### 可以做什么

- **修 Bug**：看到问题直接改，PR 描述说清楚复现步骤即可
- **加功能**：建议先提 Issue 讨论，再动手写
- **改善翻译提示样式**：`content.js` 里的 CSS 可以直接改
- **支持新语言**：在 `content.js` 的 `LANG_PATTERNS` 里加正则
- **改进文档**：README、注释、使用说明，都欢迎完善

### 发版

维护者打 tag 即可自动打包发布：

```bash
# 更新 manifest.json 和 package.sh 里的版本号
git tag v2.3
git push origin main --tags
```

GitHub Actions 会自动生成 zip 并创建 Release，下载 zip 即可提交到 Chrome Web Store。

## License

MIT
