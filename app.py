"""AI Tutor - 智能教学助手"""
import os
import json
import time
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, request, jsonify, Response
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)

# API Configuration
client = OpenAI(
    api_key=os.getenv("API_KEY"),
    base_url=os.getenv("BASE_URL", "https://api.deepseek.com")
)
MODEL = os.getenv("MODEL", "deepseek-chat")

NOTES_DIR = Path(__file__).parent / "notes"
NOTES_DIR.mkdir(exist_ok=True)


def call_ai(system_prompt: str, user_content: str, temperature: float = 0.7) -> str:
    """Call AI API with streaming support."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        temperature=temperature,
        stream=True
    )
    full_response = ""
    for chunk in response:
        if chunk.choices[0].delta.content:
            full_response += chunk.choices[0].delta.content
    return full_response


def call_ai_stream(system_prompt: str, user_content: str, temperature: float = 0.7):
    """Call AI API with streaming, yields chunks."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        temperature=temperature,
        stream=True
    )
    for chunk in response:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


# ==================== Agent Prompts ====================

DECOMPOSER_PROMPT = """你是一位专业的知识分解专家。你的任务是将教学文档分解成清晰、独立的知识点。

要求：
1. 将文档分解为独立的知识点，每个知识点包含：标题、核心内容、难度等级（基础/进阶/高级）
2. 保持知识点之间的逻辑顺序
3. 标注关键术语和概念
4. 输出格式为 Markdown

输出格式示例：
## 知识点 1：[标题]
- **难度**：基础/进阶/高级
- **核心内容**：...
- **关键术语**：术语1、术语2

---

## 知识点 2：[标题]
...
"""

ORGANIZER_PROMPT = """你是一位专业的知识梳理专家。你的任务是将分解后的知识点重新组织，建立关联，标注重点。

要求：
1. 分析知识点之间的依赖关系和关联
2. 建立知识图谱式的层级结构
3. 标注重难点（⭐ 重要、⭐⭐ 很重要、⭐⭐⭐ 核心）
4. 添加知识点之间的交叉引用
5. 输出格式为 Markdown，结构清晰

输出格式：
# 知识梳理笔记

## 知识结构总览
（用树形或层级结构展示知识关系）

## 详细知识点
### 第一层：基础概念
#### 1. [知识点名] ⭐
- 内容...
- 关联：→ 参见知识点 X

### 第二层：进阶内容
...

## 知识关联图
（用文字描述知识点之间的关系）
"""

REVIEWER_PROMPT = """你是一位严格的知识审核专家。你的任务是审核梳理后的知识笔记，确保准确性、完整性和逻辑性。

审核标准：
1. 知识点是否完整，有无遗漏
2. 逻辑关系是否正确
3. 重点标注是否合理
4. 是否有过时或错误的内容
5. 表述是否清晰易懂

要求：
- 如果发现问题，直接修正（不要只标记）
- 如果需要补充，直接添加
- 保持原有格式，修正后输出完整的笔记
- 在笔记末尾添加一个「审核说明」章节，列出你做了哪些修改
"""

TEACHER_PROMPT = """你是一位耐心、专业的全栈工程教师。你的风格是：

1. 通俗易懂，善于用类比和例子解释概念
2. 鼓励学生思考，不直接给答案而是引导
3. 会用代码示例辅助说明
4. 语气亲切但专业，不说废话
5. 如果学生问的问题超出当前笔记范围，也会尽力解答

你已经掌握了以下学习笔记：
---
{notes}
---

基于以上笔记内容回答学生的问题。如果问题与笔记无关但你了解，也可以回答，但要说明这超出了当前学习范围。
"""


# ==================== Routes ====================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/process", methods=["POST"])
def process_document():
    """Process document through the agent pipeline."""
    data = request.json
    content = data.get("content", "").strip()
    steps = data.get("steps", ["decompose", "organize", "review"])  # which steps to run
    
    if not content:
        return jsonify({"error": "内容不能为空"}), 400

    def generate():
        results = {}
        current_content = content
        
        # Step 1: Decompose
        if "decompose" in steps:
            yield json.dumps({"type": "step_start", "step": "decompose", "message": "🔍 正在分解知识..."}) + "\n"
            result = call_ai(DECOMPOSER_PROMPT, current_content)
            results["decompose"] = result
            current_content = result
            yield json.dumps({"type": "step_end", "step": "decompose", "content": result}) + "\n"
        
        # Step 2: Organize
        if "organize" in steps:
            yield json.dumps({"type": "step_start", "step": "organize", "message": "🔗 正在梳理知识关联..."}) + "\n"
            result = call_ai(ORGANIZER_PROMPT, current_content)
            results["organize"] = result
            current_content = result
            yield json.dumps({"type": "step_end", "step": "organize", "content": result}) + "\n"
        
        # Step 3: Review
        if "review" in steps:
            yield json.dumps({"type": "step_start", "step": "review", "message": "✅ 正在审核校验..."}) + "\n"
            result = call_ai(REVIEWER_PROMPT, current_content)
            results["review"] = result
            current_content = result
            yield json.dumps({"type": "step_end", "step": "review", "content": result}) + "\n"
        
        # Save note
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"note_{timestamp}.md"
        filepath = NOTES_DIR / filename
        filepath.write_text(current_content, encoding="utf-8")
        
        yield json.dumps({
            "type": "done",
            "filename": filename,
            "content": current_content
        }) + "\n"

    return Response(generate(), mimetype="text/event-stream")


@app.route("/api/ask", methods=["POST"])
def ask_question():
    """Answer student questions based on notes."""
    data = request.json
    question = data.get("question", "").strip()
    notes = data.get("notes", "").strip()
    
    if not question:
        return jsonify({"error": "问题不能为空"}), 400

    def generate():
        prompt = TEACHER_PROMPT.format(notes=notes if notes else "暂无学习笔记，请直接回答学生的问题。")
        for chunk in call_ai_stream(prompt, question):
            yield json.dumps({"type": "chunk", "content": chunk}) + "\n"
        yield json.dumps({"type": "done"}) + "\n"

    return Response(generate(), mimetype="text/event-stream")


@app.route("/api/notes", methods=["GET"])
def list_notes():
    """List all saved notes."""
    notes = []
    for f in sorted(NOTES_DIR.glob("*.md"), reverse=True):
        notes.append({
            "filename": f.name,
            "created": datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
            "preview": f.read_text(encoding="utf-8")[:200]
        })
    return jsonify(notes)


@app.route("/api/notes/<filename>", methods=["GET"])
def get_note(filename):
    """Get a specific note."""
    filepath = NOTES_DIR / filename
    if not filepath.exists():
        return jsonify({"error": "笔记不存在"}), 404
    return jsonify({"filename": filename, "content": filepath.read_text(encoding="utf-8")})


@app.route("/api/notes/<filename>", methods=["PUT"])
def update_note(filename):
    """Update a note."""
    filepath = NOTES_DIR / filename
    if not filepath.exists():
        return jsonify({"error": "笔记不存在"}), 404
    data = request.json
    filepath.write_text(data.get("content", ""), encoding="utf-8")
    return jsonify({"message": "已保存"})


@app.route("/api/notes/<filename>", methods=["DELETE"])
def delete_note(filename):
    """Delete a note."""
    filepath = NOTES_DIR / filename
    if filepath.exists():
        filepath.unlink()
    return jsonify({"message": "已删除"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
