# 🎓 AI Tutor - 智能教学助手

一个基于 AI 的智能教学工具，能够将教学文档自动分解、梳理、审核，生成结构化的学习笔记，并提供实时答疑功能。

## ✨ 功能特点

- **知识分解**：将复杂文档拆解为独立的知识点，标注难度等级
- **知识梳理**：建立知识点之间的关联，标注重点和难点
- **审核校验**：AI 自动审核笔记的准确性、完整性，纠错并补充
- **笔记生成**：输出结构清晰的 Markdown 笔记，支持编辑和导出
- **实时答疑**：基于笔记内容进行对话式答疑，支持代码示例

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置 API

复制 `.env.example` 为 `.env`，填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
API_KEY=your_deepseek_api_key_here
BASE_URL=https://api.deepseek.com
MODEL=deepseek-chat
```

### 3. 启动应用

```bash
python app.py
```

访问 http://localhost:5000 即可使用。

## 📖 使用说明

1. **输入文档**：在左侧粘贴教学文档内容，或上传 `.txt` / `.md` 文件
2. **选择步骤**：勾选需要的处理步骤（默认全选）
3. **开始处理**：点击「开始处理」按钮，AI 将依次执行各步骤
4. **查看笔记**：右侧实时预览生成的笔记，支持编辑和导出
5. **提问答疑**：在底部对话框输入问题，AI 基于笔记内容为你解答

## 🏗️ 项目结构

```
tutor-app/
├── app.py              # Flask 后端
├── requirements.txt    # Python 依赖
├── .env.example        # 环境变量模板
├── .gitignore
├── README.md
├── templates/
│   └── index.html      # 前端页面
├── static/
│   ├── css/
│   │   └── style.css   # 自定义样式
│   └── js/
│       └── app.js      # 前端逻辑
└── notes/              # 生成的笔记存储目录
```

## 🛠️ 技术栈

- **后端**：Python + Flask
- **前端**：HTML + Tailwind CSS + Marked.js + Highlight.js
- **AI**：OpenAI 兼容 API（DeepSeek）

## 📝 License

MIT
