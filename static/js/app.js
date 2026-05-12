// AI Tutor — Frontend Logic

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
let currentNotes = "";
let currentFilename = "";
let isProcessing = false;
let isEditing = false;
let chatHistory = [];
let selectedText = "";
let remainingSteps = [];
let streamBuffer = "";

// DOM
const els = {
    input: $("#input-content"),
    fileInput: $("#file-input"),
    btnProcess: $("#btn-process"),
    btnNextStep: $("#btn-next-step"),
    btnStop: $("#btn-stop"),
    progressPanel: $("#progress-panel"),
    progressLog: $("#progress-log"),
    preview: $("#note-preview"),
    editor: $("#note-editor"),
    btnEdit: $("#btn-edit"),
    btnSave: $("#btn-save"),
    btnExportMd: $("#btn-export-md"),
    btnExportHtml: $("#btn-export-html"),
    chatMsgs: $("#chat-messages"),
    chatInput: $("#chat-input"),
    btnSend: $("#btn-send"),
    btnClearChat: $("#btn-clear-chat"),
    btnNotesList: $("#btn-notes-list"),
    modal: $("#notes-modal"),
    btnCloseModal: $("#btn-close-modal"),
    notesList: $("#notes-list"),
    notesSearch: $("#notes-search"),
    selPreview: $("#selected-text-preview"),
    selContent: $("#selected-text-content"),
    btnClearSel: $("#btn-clear-selection"),
    wordCount: $("#word-count"),
};

// ==================== File Upload ====================
els.fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { els.input.value = ev.target.result; };
    reader.readAsText(file);
});

// ==================== Helpers ====================
function getSelectedSteps() {
    const steps = [];
    if ($("#step-decompose").checked) steps.push("decompose");
    if ($("#step-organize").checked) steps.push("organize");
    if ($("#step-review").checked) steps.push("review");
    return steps;
}

function getProcessMode() {
    return document.querySelector('input[name="process-mode"]:checked').value;
}

function setProcessing(on) {
    isProcessing = on;
    els.btnProcess.disabled = on;
    els.btnProcess.classList.toggle("hidden", on);
    els.btnStop.classList.toggle("hidden", !on);
    els.progressPanel.classList.toggle("hidden", !on);
}

function resetStatuses() {
    ["decompose", "organize", "review"].forEach(s => {
        const el = $(`#status-${s}`);
        el.textContent = "";
        el.className = "step-status";
    });
}

function addLog(msg) {
    const t = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    els.progressLog.innerHTML += `<div><span class="text-text-muted">[${t}]</span> ${msg}</div>`;
    els.progressLog.scrollTop = els.progressLog.scrollHeight;
}

function updatePreview(content) {
    els.preview.innerHTML = marked.parse(content);
    els.preview.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));
    els.wordCount.textContent = `${content.length} 字`;
}

function renderMarkdown(target, content) {
    target.innerHTML = marked.parse(content);
    target.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));
}

// ==================== Processing ====================
async function startProcess(content, steps, mode) {
    setProcessing(true);
    resetStatuses();
    remainingSteps = [...steps];
    streamBuffer = "";

    try {
        const res = await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, steps, mode }),
        });
        await handleStream(res);
    } catch (e) {
        addLog(`错误: ${e.message}`);
    } finally {
        setProcessing(false);
        els.btnNextStep.classList.add("hidden");
    }
}

async function resumeProcess(content, steps, mode) {
    setProcessing(true);
    streamBuffer = "";
    try {
        const res = await fetch("/api/process/resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, remaining_steps: steps, mode }),
        });
        await handleStream(res);
    } catch (e) {
        addLog(`错误: ${e.message}`);
    } finally {
        setProcessing(false);
        els.btnNextStep.classList.add("hidden");
    }
}

async function handleStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
            if (!line.trim()) continue;
            try { handleMessage(JSON.parse(line)); } catch (e) {}
        }
    }
}

function handleMessage(data) {
    switch (data.type) {
        case "step_start":
            addLog(data.message);
            $(`#status-${data.step}`).textContent = "●";
            $(`#status-${data.step}`).className = "step-status status-running";
            break;
        case "chunk":
            streamBuffer += data.content;
            updatePreview(streamBuffer);
            break;
        case "step_end":
            $(`#status-${data.step}`).textContent = "✓";
            $(`#status-${data.step}`).className = "step-status status-done";
            addLog(`${data.step} 完成`);
            updatePreview(data.content);
            remainingSteps = remainingSteps.filter(s => s !== data.step);
            break;
        case "step_pause":
            addLog(data.message);
            if (remainingSteps.length > 0) {
                els.btnNextStep.classList.remove("hidden");
                els.btnStop.classList.add("hidden");
            }
            break;
        case "done":
            currentNotes = data.content;
            currentFilename = data.filename;
            updatePreview(data.content);
            addLog(`已保存: ${data.filename}`);
            addChat("ai", "笔记已生成完毕，可以查看预览或直接提问。");
            break;
    }
}

// Process button
els.btnProcess.addEventListener("click", () => {
    const content = els.input.value.trim();
    if (!content) return alert("请先输入文档内容");
    const steps = getSelectedSteps();
    if (!steps.length) return alert("请至少选择一个步骤");
    startProcess(content, steps, getProcessMode());
});

els.btnNextStep.addEventListener("click", () => {
    els.btnNextStep.classList.add("hidden");
    resumeProcess(els.input.value.trim(), remainingSteps, getProcessMode());
});

els.btnStop.addEventListener("click", () => {
    isProcessing = false;
    addLog("已停止");
    setProcessing(false);
});

// ==================== Note Edit / Export ====================
els.btnEdit.addEventListener("click", () => {
    if (isEditing) return;
    isEditing = true;
    els.editor.value = currentNotes;
    els.preview.classList.add("hidden");
    els.editor.classList.remove("hidden");
    els.btnSave.classList.remove("hidden");
    els.btnEdit.classList.add("hidden");
    els.editor.focus();
});

els.btnSave.addEventListener("click", saveNote);

async function saveNote() {
    if (!isEditing) return;
    currentNotes = els.editor.value;
    if (currentFilename) {
        try {
            await fetch(`/api/notes/${currentFilename}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: currentNotes }),
            });
        } catch (e) {}
    }
    isEditing = false;
    updatePreview(currentNotes);
    els.preview.classList.remove("hidden");
    els.editor.classList.add("hidden");
    els.btnSave.classList.add("hidden");
    els.btnEdit.classList.remove("hidden");
}

els.btnExportMd.addEventListener("click", () => {
    if (!currentNotes) return alert("暂无可导出的笔记");
    const blob = new Blob([currentNotes], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = currentFilename || "笔记.md";
    a.click();
});

els.btnExportHtml.addEventListener("click", () => {
    if (!currentFilename) return alert("请先保存笔记");
    window.open(`/api/notes/${currentFilename}/export/html`, "_blank");
});

// ==================== Note Selection ====================
els.preview.addEventListener("mouseup", () => {
    const text = window.getSelection().toString().trim();
    if (text && text.length > 2) {
        selectedText = text;
        els.selContent.textContent = text.length > 60 ? text.substring(0, 60) + "…" : text;
        els.selPreview.classList.remove("hidden");
    }
});

els.btnClearSel.addEventListener("click", () => {
    selectedText = "";
    els.selPreview.classList.add("hidden");
});

// ==================== Chat ====================
async function sendQuestion() {
    const q = els.chatInput.value.trim();
    if (!q) return;

    let fullQ = q;
    if (selectedText) {
        fullQ = `关于这段内容：\n> ${selectedText}\n\n问题：${q}`;
        selectedText = "";
        els.selPreview.classList.add("hidden");
    }

    addChat("user", q);
    chatHistory.push({ role: "user", content: fullQ });
    els.chatInput.value = "";

    const aiEl = addChat("ai", "", true);

    try {
        const res = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: fullQ, notes: currentNotes, history: chatHistory.slice(-10) }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            for (const line of text.trim().split("\n")) {
                if (!line) continue;
                try {
                    const d = JSON.parse(line);
                    if (d.type === "chunk") {
                        full += d.content;
                        renderMarkdown(aiEl, full);
                        els.chatMsgs.scrollTop = els.chatMsgs.scrollHeight;
                    }
                } catch (e) {}
            }
        }
        chatHistory.push({ role: "assistant", content: full });
    } catch (e) {
        aiEl.innerHTML = `<span class="text-rose-400 text-xs">请求失败: ${e.message}</span>`;
    }
}

function addChat(role, content, isPlaceholder = false) {
    const div = document.createElement("div");
    div.className = "chat-msg flex gap-3";

    if (role === "user") {
        div.innerHTML = `<div class="flex-1 flex justify-end"><div class="chat-bubble-user">${escapeHtml(content)}</div></div>`;
    } else {
        div.innerHTML = `
            <div class="chat-avatar bg-gradient-to-br from-blue-500 to-violet-500">T</div>
            <div class="chat-bubble-ai">${isPlaceholder ? '<span class="animate-pulse text-text-muted">思考中…</span>' : marked.parse(content)}</div>`;
    }

    els.chatMsgs.appendChild(div);
    els.chatMsgs.scrollTop = els.chatMsgs.scrollHeight;
    return isPlaceholder ? div.querySelector(".chat-bubble-ai") : div;
}

function escapeHtml(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }

els.btnSend.addEventListener("click", sendQuestion);
els.chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(); } });

els.btnClearChat.addEventListener("click", () => {
    chatHistory = [];
    els.chatMsgs.innerHTML = `
        <div class="chat-msg flex gap-3">
            <div class="chat-avatar bg-gradient-to-br from-blue-500 to-violet-500">T</div>
            <div class="chat-bubble-ai">对话已清空。</div>
        </div>`;
});

// ==================== Notes Modal ====================
els.btnNotesList.addEventListener("click", async () => {
    els.modal.classList.remove("hidden");
    els.notesSearch.value = "";
    await loadNotes();
    els.notesSearch.focus();
});

els.btnCloseModal.addEventListener("click", () => els.modal.classList.add("hidden"));
els.modal.addEventListener("click", (e) => { if (e.target === els.modal) els.modal.classList.add("hidden"); });

let searchTimer;
els.notesSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadNotes(els.notesSearch.value), 300);
});

async function loadNotes(q = "") {
    try {
        const res = await fetch(q ? `/api/notes?q=${encodeURIComponent(q)}` : "/api/notes");
        const notes = await res.json();

        if (!notes.length) {
            els.notesList.innerHTML = `<div class="text-center text-text-muted py-16 text-sm">${q ? "无匹配笔记" : "暂无笔记"}</div>`;
            return;
        }

        els.notesList.innerHTML = notes.map(n => {
            const tags = n.tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join("");
            return `
            <div class="note-row" data-filename="${n.filename}">
                <div class="note-icon">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <div class="note-info">
                    <div class="note-name">${n.filename}</div>
                    <div class="note-meta">${n.created} · ${n.word_count} 字</div>
                    ${tags ? `<div class="note-tags">${tags}</div>` : ""}
                </div>
                <button class="btn-icon note-delete" data-filename="${n.filename}" title="删除">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>`;
        }).join("");

        $$(".note-row").forEach(el => {
            el.addEventListener("click", async (e) => {
                if (e.target.closest(".note-delete")) return;
                try {
                    const r = await fetch(`/api/notes/${el.dataset.filename}`);
                    const d = await r.json();
                    currentNotes = d.content;
                    currentFilename = d.filename;
                    updatePreview(currentNotes);
                    els.modal.classList.add("hidden");
                } catch (e) {}
            });
        });

        $$(".note-delete").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (!confirm(`删除 ${btn.dataset.filename}？`)) return;
                try {
                    await fetch(`/api/notes/${btn.dataset.filename}`, { method: "DELETE" });
                    await loadNotes(els.notesSearch.value);
                } catch (e) {}
            });
        });
    } catch (e) {
        els.notesList.innerHTML = '<div class="text-center text-rose-400 py-12 text-sm">加载失败</div>';
    }
}

// ==================== Keyboard Shortcuts ====================
document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); if (!isProcessing) els.btnProcess.click(); }
    if (e.ctrlKey && e.key === "s") { e.preventDefault(); if (isEditing) saveNote(); }
    if (e.key === "Escape" && !els.modal.classList.contains("hidden")) els.modal.classList.add("hidden");
});

// ==================== Init ====================
marked.setOptions({ breaks: true, gfm: true });
