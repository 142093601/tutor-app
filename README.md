# AI Tutor — 智能教学助手

一个基于 AI 的学习工具，将教学文档自动分解、梳理、审核，生成结构化笔记，并提供实时答疑。

![Python](https://img.shields.io/badge/Python-3.10+-blue)
![Flask](https://img.shields.io/badge/Flask-3.x-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 功能

- **知识分解** — 将复杂文档拆解为独立知识点，标注难度等级
- **知识梳理** — 建立知识点间的关联关系，标注重点难点
- **审核校验** — AI 自动审核准确性、完整性，纠错并补充
- **笔记生成** — 输出结构清晰的 Markdown 笔记，支持在线编辑
- **实时答疑** — 基于笔记内容的多轮对话，支持选中文字提问
- **流式输出** — 处理过程实时显示，不再干等
- **分步执行** — 可选择每步暂停，看完效果再继续
- **多种导出** — 支持导出 Markdown 和 HTML 格式

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/142093601/tutor-app.git
cd tutor-app
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置 API

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 API Key：

```env
API_KEY=your_api_key_here
BASE_URL=https://api.deepseek.com
MODEL=deepseek-chat
```

支持任何 OpenAI 兼容格式的 API（DeepSeek、OpenAI、Moonshot 等）。

### 4. 启动

```bash
python app.py
```

浏览器打开 http://localhost:5000

## 使用说明

### 处理文档

1. 在左侧「输入」区域粘贴教学文档，或上传 `.txt` / `.md` 文件
2. 勾选需要的处理步骤（默认全选）
3. 选择处理模式：
   - **全自动** — 一步到位，依次执行所有步骤
   - **分步执行** — 每步暂停，确认后再继续下一步
4. 点击「开始处理」或按 `Ctrl+Enter`

### 查看笔记

- 右侧实时预览生成的笔记
- 点击编辑按钮进入编辑模式，修改后保存
- 支持导出为 Markdown（`.md`）或 HTML 文件

### 提问答疑

- 在底部对话框输入问题，AI 基于笔记内容回答
- **选中提问**：在笔记预览区选中文字后提问，AI 会针对该段内容解答
- 支持多轮对话，AI 会记住上下文

### 笔记管理

- 点击右上角「笔记」查看历史笔记列表
- 支持搜索笔记内容
- 显示创建时间、字数、自动提取的标签

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Enter` | 开始处理 |
| `Ctrl+S` | 保存笔记（编辑模式下） |
| `Esc` | 关闭弹窗 |
| `Enter` | 发送消息（对话框内） |

## 项目结构

```
tutor-app/
├── app.py                  # Flask 后端主程序
├── requirements.txt        # Python 依赖
├── .env.example            # 环境变量模板
├── .gitignore
├── README.md
├── templates/
│   └── index.html          # 前端页面
├── static/
│   ├── css/
│   │   └── style.css       # 样式文件
│   └── js/
│       └── app.js          # 前端逻辑
└── notes/                  # 生成的笔记存储目录
```

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.10+ / Flask 3.x |
| 前端 | HTML / Tailwind CSS / Vanilla JS |
| AI | OpenAI 兼容 API（DeepSeek V4） |
| Markdown | Marked.js + Highlight.js |
| 字体 | Inter + JetBrains Mono |

## Agent 说明

项目内置 4 个 AI Agent，按需调用：

| Agent | 职责 | 触发条件 |
|-------|------|----------|
| 知识分解 | 将文档拆解为独立知识点 | 处理流程第一步 |
| 知识梳理 | 建立关联、标注重点 | 分解完成后 |
| 审核校验 | 纠错、补充、完善 | 梳理完成后 |
| 答疑教师 | 基于笔记回答问题 | 用户提问时 |

## License

MIT
