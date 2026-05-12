// AI Tutor - Frontend Logic

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
let currentNotes = "";
let currentFilename = "";
let isProcessing = false;
let isEditing = false;

// DOM Elements
const inputContent = $("#input-content");
const fileInput = $("#file-input");
const btnProcess = $("#btn-process");
const btnStop = $("#btn-stop");
const progressPanel = $("#progress-panel");
const progressLog = $("#progress-log");
const notePreview = $("#note-preview");
const noteEditor = $("#note-editor");
const btnEdit = $("#btn-edit");
const btnSave = $("#btn-save");
const btnExport = $("#btn-export");
const chatMessages = $("#chat-messages");
const chatInput = $("#chat-input");
const btnSend = $("#btn-send");
const btnNotesList = $("#btn-notes-list");
const notesModal = $("#notes-modal");
const btnCloseModal = $("#btn-close-modal");
const notesList = $("#notes-list");

// ==================== File Upload ====================

fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        inputContent.value = e.target.result;
    };
    reader.readAsText(file);
});

// ==================== Processing Pipeline ====================

btnProcess.addEventListener("click", async () => {
    const content = inputContent.value.trim();
    if (!content) {
        alert("请先输入或上传教学文档内容");
        return;
    }

    // Get selected steps
    const steps = [];
    if ($("#step-decompose").checked) steps.push("decompose");
    if ($("#step-organize").checked) steps.push("organize");
    if ($("#step-review").checked) steps.push("review");

    if (steps.length === 0) {
        alert("请至少选择一个处理步骤");
        return;
    }

    isProcessing = true;
    btnProcess.disabled = true;
    btnStop.classList.remove("hidden");
    progressPanel.classList.remove("hidden");
    progressLog.innerHTML = "";

    // Reset step statuses
    $$(".step-checkbox").forEach((cb) => {
        const step = cb.id.replace("step-", "");
        $(`#status-${step}`).textContent = "";
        $(`#status-${step}`).className = "text-xs";
    });

    try {
        const response = await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, steps }),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.trim().split("\n");

            for (const line of lines) {
                if (!line) continue;
                try {
                    const data = JSON.parse(line);
                    handleProcessMessage(data);
                } catch (e) {
                    console.error("Parse error:", e);
                }
            }
        }
    } catch (error) {
        addLog(`❌ 错误: ${error.message}`);
    } finally {
        isProcessing = false;
        btnProcess.disabled = false;
        btnStop.classList.add("hidden");
    }
});

btnStop.addEventListener("click", () => {
    isProcessing = false;
    addLog("⏹ 已停止处理");
});

function handleProcessMessage(data) {
    switch (data.type) {
        case "step_start":
            addLog(data.message);
            const stepName = data.step;
            $(`#status-${stepName}`).textContent = "⏳";
            $(`#status-${stepName}`).className = "text-xs status-running";
            break;

        case "step_end":
            const step = data.step;
            $(`#status-${step}`).textContent = "✅";
            $(`#status-${step}`).className = "text-xs status-done";
            addLog(`✅ ${step} 完成`);
            // Update preview with intermediate result
            updatePreview(data.content);
            break;

        case "done":
            currentNotes = data.content;
            currentFilename = data.filename;
            updatePreview(data.content);
            addLog(`📝 笔记已保存: ${data.filename}`);
            // Show completion in chat
            addChatMessage("AI", "笔记已生成完毕！你可以查看右侧预览，或者直接向我提问 🎉");
            break;
    }
}

function addLog(message) {
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    progressLog.innerHTML += `<div><span class="text-dark-400">[${time}]</span> ${message}</div>`;
    progressLog.scrollTop = progressLog.scrollHeight;
}

// ==================== Note Preview & Edit ====================

function updatePreview(content) {
    notePreview.innerHTML = marked.parse(content);
    // Highlight code blocks
    notePreview.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block);
    });
}

btnEdit.addEventListener("click", () => {
    if (isEditing) return;
    isEditing = true;
    noteEditor.value = currentNotes;
    notePreview.classList.add("hidden");
    noteEditor.classList.remove("hidden");
    btnSave.classList.remove("hidden");
    btnEdit.classList.add("hidden");
});

btnSave.addEventListener("click", async () => {
    if (!isEditing) return;
    currentNotes = noteEditor.value;
    
    // Save to server
    if (currentFilename) {
        try {
            await fetch(`/api/notes/${currentFilename}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: currentNotes }),
            });
        } catch (e) {
            console.error("Save error:", e);
        }
    }

    isEditing = false;
    updatePreview(currentNotes);
    notePreview.classList.remove("hidden");
    noteEditor.classList.add("hidden");
    btnSave.classList.add("hidden");
    btnEdit.classList.remove("hidden");
});

btnExport.addEventListener("click", () => {
    if (!currentNotes) {
        alert("暂无可导出的笔记");
        return;
    }
    const blob = new Blob([currentNotes], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename || "笔记.md";
    a.click();
    URL.revokeObjectURL(url);
});

// ==================== Q&A Chat ====================

async function sendQuestion() {
    const question = chatInput.value.trim();
    if (!question) return;

    addChatMessage("user", question);
    chatInput.value = "";

    // Create AI message placeholder
    const aiMsgEl = addChatMessage("AI", "", true);

    try {
        const response = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, notes: currentNotes }),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.trim().split("\n");

            for (const line of lines) {
                if (!line) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.type === "chunk") {
                        fullResponse += data.content;
                        aiMsgEl.innerHTML = marked.parse(fullResponse);
                    }
                } catch (e) {}
            }
        }

        // Final render with code highlighting
        aiMsgEl.querySelectorAll("pre code").forEach((block) => {
            hljs.highlightElement(block);
        });
    } catch (error) {
        aiMsgEl.innerHTML = `<span class="text-red-400">❌ 请求失败: ${error.message}</span>`;
    }
}

function addChatMessage(role, content, isPlaceholder = false) {
    const div = document.createElement("div");
    div.className = "flex gap-3 chat-msg";

    if (role === "user") {
        div.innerHTML = `
            <div class="flex-1 flex justify-end">
                <div class="bg-accent/20 rounded-xl rounded-tr-sm px-4 py-2.5 text-sm text-dark-100 max-w-[80%]">
                    ${escapeHtml(content)}
                </div>
            </div>`;
    } else {
        div.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-sm flex-shrink-0">AI</div>
            <div class="bg-dark-500 rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-dark-100 max-w-[80%] ${isPlaceholder ? 'typing-cursor' : ''}">
                ${isPlaceholder ? '<span class="animate-pulse">思考中...</span>' : marked.parse(content)}
            </div>`;
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (isPlaceholder) {
        return div.querySelector(".bg-dark-500");
    }
    return div;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

btnSend.addEventListener("click", sendQuestion);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendQuestion();
    }
});

// ==================== Notes List Modal ====================

btnNotesList.addEventListener("click", async () => {
    notesModal.classList.remove("hidden");
    await loadNotesList();
});

btnCloseModal.addEventListener("click", () => {
    notesModal.classList.add("hidden");
});

notesModal.addEventListener("click", (e) => {
    if (e.target === notesModal) {
        notesModal.classList.add("hidden");
    }
});

async function loadNotesList() {
    try {
        const response = await fetch("/api/notes");
        const notes = await response.json();

        if (notes.length === 0) {
            notesList.innerHTML = '<div class="text-center text-dark-300 py-8">暂无笔记</div>';
            return;
        }

        notesList.innerHTML = notes.map((note) => `
            <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-dark-500/50 cursor-pointer transition-all note-item" data-filename="${note.filename}">
                <div class="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-lg">📄</div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-dark-100 truncate">${note.filename}</div>
                    <div class="text-xs text-dark-300">${note.created}</div>
                </div>
                <button class="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-400/10 transition-all delete-note" data-filename="${note.filename}">🗑</button>
            </div>
        `).join("");

        // Click to load note
        $$(".note-item").forEach((el) => {
            el.addEventListener("click", async (e) => {
                if (e.target.closest(".delete-note")) return;
                const filename = el.dataset.filename;
                try {
                    const res = await fetch(`/api/notes/${filename}`);
                    const data = await res.json();
                    currentNotes = data.content;
                    currentFilename = data.filename;
                    updatePreview(currentNotes);
                    notesModal.classList.add("hidden");
                } catch (e) {
                    console.error("Load error:", e);
                }
            });
        });

        // Delete note
        $$(".delete-note").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const filename = btn.dataset.filename;
                if (!confirm(`确定删除 ${filename}？`)) return;
                try {
                    await fetch(`/api/notes/${filename}`, { method: "DELETE" });
                    await loadNotesList();
                } catch (e) {
                    console.error("Delete error:", e);
                }
            });
        });
    } catch (error) {
        notesList.innerHTML = '<div class="text-center text-red-400 py-8">加载失败</div>';
    }
}

// ==================== Init ====================

// Configure marked
marked.setOptions({
    breaks: true,
    gfm: true,
});
