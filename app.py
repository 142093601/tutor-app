"""AI Tutor - 智能教学助手"""
import os
import json
import re
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, request, jsonify, Response
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)

client = OpenAI(
    api_key=os.getenv("API_KEY"),
    base_url=os.getenv("BASE_URL", "https://api.deepseek.com")
)
MODEL = os.getenv("MODEL", "deepseek-chat")

NOTES_DIR = Path(__file__).parent / "notes"
NOTES_DIR.mkdir(exist_ok=True)


def call_ai_stream(system_prompt: str, messages: list, temperature: float = 0.7):
    """Call AI API with multi-turn conversation support and streaming."""
    api_messages = [{"role": "system", "content": system_prompt}] + messages
    response = client.chat.completions.create(
        model=MODEL,
        messages=api_messages,
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


# ==================== Helpers ====================

def parse_note_tags(content: str) -> list:
    """Extract tags from note content (look for headers and keywords)."""
    tags = set()
    # Extract from headers
    for match in re.findall(r'^#+\s+(.+)$', content, re.MULTILINE):
        header = match.strip()
        if len(header) < 20:
            tags.add(header)
    return list(tags)[:10]


def get_note_metadata(filepath: Path) -> dict:
    """Get note metadata including tags."""
    content = filepath.read_text(encoding="utf-8")
    stat = filepath.stat()
    return {
        "filename": filepath.name,
        "created": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
        "size": stat.st_size,
        "preview": content[:200],
        "tags": parse_note_tags(content),
        "word_count": len(content),
    }


# ==================== Routes ====================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/process", methods=["POST"])
def process_document():
    """Process document through the agent pipeline with streaming."""
    data = request.json
    content = data.get("content", "").strip()
    mode = data.get("mode", "auto")  # auto or step
    steps = data.get("steps", ["decompose", "organize", "review"])

    if not content:
        return jsonify({"error": "内容不能为空"}), 400

    def generate():
        current_content = content
        step_map = {
            "decompose": ("🔍 知识分解", DECOMPOSER_PROMPT),
            "organize": ("🔗 知识梳理", ORGANIZER_PROMPT),
            "review": ("✅ 审核校验", REVIEWER_PROMPT),
        }

        for step_key in steps:
            label, prompt = step_map[step_key]
            yield json.dumps({"type": "step_start", "step": step_key, "message": f"{label} 中..."}) + "\n"

            step_result = ""
            for chunk in call_ai_stream(prompt, [{"role": "user", "content": current_content}]):
                step_result += chunk
                yield json.dumps({"type": "chunk", "step": step_key, "content": chunk}) + "\n"

            current_content = step_result
            yield json.dumps({"type": "step_end", "step": step_key, "content": step_result}) + "\n"

            # In step mode, pause and wait for user confirmation
            if mode == "step":
                yield json.dumps({"type": "step_pause", "step": step_key, "message": f"{label} 完成，是否继续？"}) + "\n"
                return  # Client will call resume endpoint

        # All steps done, save note
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


@app.route("/api/process/resume", methods=["POST"])
def resume_process():
    """Resume a paused step-by-step process."""
    data = request.json
    content = data.get("content", "").strip()
    remaining_steps = data.get("remaining_steps", [])
    mode = data.get("mode", "step")

    if not content:
        return jsonify({"error": "内容不能为空"}), 400

    def generate():
        current_content = content
        step_map = {
            "decompose": ("🔍 知识分解", DECOMPOSER_PROMPT),
            "organize": ("🔗 知识梳理", ORGANIZER_PROMPT),
            "review": ("✅ 审核校验", REVIEWER_PROMPT),
        }

        for step_key in remaining_steps:
            label, prompt = step_map[step_key]
            yield json.dumps({"type": "step_start", "step": step_key, "message": f"{label} 中..."}) + "\n"

            step_result = ""
            for chunk in call_ai_stream(prompt, [{"role": "user", "content": current_content}]):
                step_result += chunk
                yield json.dumps({"type": "chunk", "step": step_key, "content": chunk}) + "\n"

            current_content = step_result
            yield json.dumps({"type": "step_end", "step": step_key, "content": step_result}) + "\n"

            if mode == "step":
                yield json.dumps({"type": "step_pause", "step": step_key, "message": f"{label} 完成，是否继续？"}) + "\n"
                return

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
    """Answer student questions with multi-turn conversation support."""
    data = request.json
    question = data.get("question", "").strip()
    notes = data.get("notes", "").strip()
    history = data.get("history", [])  # conversation history

    if not question:
        return jsonify({"error": "问题不能为空"}), 400

    def generate():
        prompt = TEACHER_PROMPT.format(notes=notes if notes else "暂无学习笔记，请直接回答学生的问题。")

        # Build message history for multi-turn
        messages = []
        for msg in history[-10:]:  # Keep last 10 messages for context
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": question})

        for chunk in call_ai_stream(prompt, messages):
            yield json.dumps({"type": "chunk", "content": chunk}) + "\n"
        yield json.dumps({"type": "done"}) + "\n"

    return Response(generate(), mimetype="text/event-stream")


@app.route("/api/notes", methods=["GET"])
def list_notes():
    """List all saved notes with metadata."""
    query = request.args.get("q", "").lower()
    notes = []
    for f in sorted(NOTES_DIR.glob("*.md"), reverse=True):
        meta = get_note_metadata(f)
        if query and query not in meta["preview"].lower() and query not in meta["filename"].lower():
            # Also search in tags
            if not any(query in tag.lower() for tag in meta["tags"]):
                continue
        notes.append(meta)
    return jsonify(notes)


@app.route("/api/notes/<filename>", methods=["GET"])
def get_note(filename):
    filepath = NOTES_DIR / filename
    if not filepath.exists():
        return jsonify({"error": "笔记不存在"}), 404
    return jsonify({"filename": filename, "content": filepath.read_text(encoding="utf-8")})


@app.route("/api/notes/<filename>", methods=["PUT"])
def update_note(filename):
    filepath = NOTES_DIR / filename
    if not filepath.exists():
        return jsonify({"error": "笔记不存在"}), 404
    data = request.json
    filepath.write_text(data.get("content", ""), encoding="utf-8")
    return jsonify({"message": "已保存"})


@app.route("/api/notes/<filename>", methods=["DELETE"])
def delete_note(filename):
    filepath = NOTES_DIR / filename
    if filepath.exists():
        filepath.unlink()
    return jsonify({"message": "已删除"})


@app.route("/api/notes/<filename>/export/html", methods=["GET"])
def export_html(filename):
    """Export note as styled HTML."""
    filepath = NOTES_DIR / filename
    if not filepath.exists():
        return jsonify({"error": "笔记不存在"}), 404

    content = filepath.read_text(encoding="utf-8")
    import markdown
    html_content = markdown.markdown(content, extensions=["tables", "fenced_code"])

    html_template = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{filename}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #0f172a; color: #e2e8f0; line-height: 1.8; }}
h1 {{ color: #f8fafc; border-bottom: 2px solid #334155; padding-bottom: 0.5rem; }}
h2 {{ color: #f8fafc; margin-top: 2rem; }}
h3 {{ color: #e2e8f0; }}
code {{ background: #1e293b; padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.9em; color: #818cf8; }}
pre {{ background: #020617; border: 1px solid #334155; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; }}
pre code {{ background: transparent; color: #e2e8f0; }}
blockquote {{ border-left: 3px solid #6366f1; padding-left: 1rem; color: #94a3b8; }}
table {{ border-collapse: collapse; width: 100%; }}
th {{ background: #1e293b; padding: 0.5rem; border: 1px solid #334155; }}
td {{ padding: 0.5rem; border: 1px solid #334155; }}
a {{ color: #818cf8; }}
hr {{ border-color: #334155; }}
</style>
</head>
<body>
{html_content}
<footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid #334155;color:#64748b;font-size:0.85rem;">
Generated by AI Tutor · {datetime.now().strftime("%Y-%m-%d %H:%M")}
</footer>
</body>
</html>"""

    return Response(html_template, mimetype="text/html",
                    headers={"Content-Disposition": f"attachment; filename={filename.replace('.md', '.html')}"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
