# TransLens 词表数据

本目录包含 TransLens 的 CEFR 分级词表数据。数据与代码逻辑分离，可直接编辑 JSON 文件调整词表，无需修改代码。

## 文件说明

| 文件 | 用途 |
|------|------|
| `en-level-words.json` | 英文 CEFR 词表（A1-C1 分级） |
| `zh-level-words.json` | 中文 CEFR 词表（基于 HSK → CEFR 映射生成） |
| `zh-hsk-mapping.json` | HSK 等级到 CEFR 的映射规则 |

## 如何维护词表

### 添加/删除单词

直接编辑 `en-level-words.json` 或 `zh-level-words.json`，将单词添加到对应等级的数组中：

```json
{
  "A1": ["我", "你", "好", "新加的词"],
  "A2": [...],
  ...
}
```

### 调整单词的等级

将一个词从一个等级数组移到另一个：

```json
// 把 "其实" 从 B1 移到 A2
"A2": [..., "其实"],
"B1": [...]  // 移除 "其实"
```

### 调整 HSK → CEFR 映射

编辑 `zh-hsk-mapping.json`，修改映射后需要重新生成 `zh-level-words.json`：

```bash
# 在 translate/ 目录下运行
node scripts/generate-zh-vocab.js
```

（需要先创建此脚本，参见下方"重新生成词表"）

## 数据来源

### 英文词表 (`en-level-words.json`)

- [CEFR-J Vocabulary Profile](https://github.com/openlanguageprofiles/olp-en-cefrj)
- Oxford 3000/5000 by CEFR Level
- 共 ~1,590 词

### 中文词表 (`zh-level-words.json`)

- [HSK 完整词汇表](https://github.com/drkameleon/complete-hsk-vocabulary)（包含 HSK 2.0 + 3.0）
- 通过 `zh-hsk-mapping.json` 中的规则映射到 CEFR 等级
- 包含简体和繁体形式
- 共 ~18,500 词

### HSK → CEFR 映射依据

| HSK 2.0 | HSK 3.0 | CEFR | 说明 |
|---------|---------|------|------|
| 1级 | 1级 | A1 | 基础日常用语 |
| 2级 | 2级 | A2 | 简单交流 |
| 3级 | 3级 | B1 | 理解要点 |
| 4级 | 4级 | B2 | 理解复杂文章 |
| 5级 | 5级 | B2 | 流利表达 |
| 6级 | 6级 | C1 | 高级运用 |
| — | 7-9级 | C1 | 精通 |

参考：
- [The Chairman's Bao — HSK/CEFR 对照表](https://www.thechairmansbao.com/blog/hsk-actfl-cerf-chart/)
- [Chinese Grammar Wiki — HSK ↔ CEFR](https://resources.allsetlearning.com/chinese/grammar/HSK_Levels_and_CEFR_Levels)

## 重新生成中文词表

如果需要从最新的 HSK 数据重新生成：

```bash
# 1. 下载最新 HSK 数据
curl -sL "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/master/complete.json" -o /tmp/hsk-complete.json

# 2. 生成 zh-level-words.json
node -e "
const data = JSON.parse(require('fs').readFileSync('/tmp/hsk-complete.json', 'utf8'));
const mapping = JSON.parse(require('fs').readFileSync('vocab/zh-hsk-mapping.json', 'utf8'));

// 合并 old/new 映射
const hskToCEFR = { ...mapping.hsk2_to_cefr, ...mapping.hsk3_to_cefr };
const allLevels = Object.keys(hskToCEFR);
const levelOrder = {};
allLevels.forEach((l, i) => levelOrder[l] = i);

const result = { A1: new Set(), A2: new Set(), B1: new Set(), B2: new Set(), C1: new Set() };

for (const word of data) {
  const levels = (word.level || []).filter(l => levelOrder[l] !== undefined);
  if (levels.length === 0) continue;
  let lowest = levels[0];
  for (const l of levels) { if (levelOrder[l] < levelOrder[lowest]) lowest = l; }
  const cefr = hskToCEFR[lowest];
  if (!cefr) continue;
  result[cefr].add(word.simplified);
  if (word.forms) {
    for (const form of word.forms) {
      if (form.traditional && form.traditional !== word.simplified) {
        result[cefr].add(form.traditional);
      }
    }
  }
}

const output = {};
for (const level of ['A1','A2','B1','B2','C1']) {
  output[level] = [...result[level]].sort();
}
require('fs').writeFileSync('vocab/zh-level-words.json', JSON.stringify(output, null, 2));
console.log('Done:', Object.values(output).flat().length, 'words');
"
```
