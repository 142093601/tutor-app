// AI Tutor - Frontend Logic

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
let currentNotes = "";
let currentFilename = "";
let isProcessing = false;
let isEditing = false;
let chatHistory = []; // multi-turn conversation
let selectedText = ""; // text selected from notes
let remainingSteps = []; // for step mode

// DOM
const inputContent = $("#input-content");
const fileInput = $("#file-input");
const btnProcess = $("#btn-process");
const btnNextStep = $("#btn-next-step");
const btnStop = $("#btn-stop");
const progressPanel = $("#progress-panel");
const progressSpinner = $("#progress-spinner");
const progressLog = $("#progress-log");
const notePreview = $("#note-preview");
const noteEditor = $("#note-editor");
const btnEdit = $("#btn-edit");
const btnSave = $("#btn-save");
const btnExportMd = $("#btn-export-md");
const btnExportHtml = $("#btn-export-html");
const chatMessages = $("#chat-messages");
const chatInput = $("#chat-input");
const btnSend = $("#btn-send");
const btnClearChat = $("#btn-clear-chat");
const btnNotesList = $("#btn-notes-list");
const notesModal = $("#notes-modal");
const btnCloseModal = $("#btn-close-modal");
const notesList = $("#notes-list");
const notesSearch = $("#notes-search");
const selectedTextPreview = $("#selected-text-preview");
const selectedTextContent = $("#selected-text-content");
const btnClearSelection = $("#btn-clear-selection");
const wordCount = $("#word-count");

// ==================== File Upload ====================
fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { inputContent.value = e.target.result; };
    reader.readAsText(file);
});

// ==================== Processing Pipeline ====================

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

function setProcessingState(processing) {
    isProcessing = processing;
    btnProcess.disabled = processing;
    btnProcess.classList.toggle("hidden", processing);
    btnStop.classList.toggle("hidden", !processing);
    progressPanel.classList.toggle("hidden", !processing);
    if (processing) {
        progressSpinner.classList.remove("hidden");
        progressLog.innerHTML = "";
    }
}

function resetStepStatuses() {
    ["decompose", "organize", "review"].forEach(step => {
        $(`#status-${step}`).textContent = "";
        $(`#status-${step}`).className = "text-xs";
    });
}

async function startProcess(content, steps, mode) {
    setProcessingState(true);
    resetStepStatuses();
    remainingSteps = [...steps];

    try {
        const response = await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, steps, mode }),
        });

        await handleStreamResponse(response);
    } catch (error) {
        addLog(`❌ 错误: ${error.message}`);
    } finally {
        setProcessingState(false);
        btnNextStep.classList.add("hidden");
    }
}

async function resumeProcess(content, steps, mode) {
    setProcessingState(true);

    try {
        const response = await fetch("/api/process/resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, remaining_steps: steps, mode }),
        });

        await handleStreamResponse(response);
    } catch (error) {
        addLog(`❌ 错误: ${error.message}`);
    } finally {
        setProcessingState(false);
        btnNextStep.classList.add("hidden");
    }
}

async function handleStreamResponse(response) {
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
            try {
                const data = JSON.parse(line);
                handleProcessMessage(data);
            } catch (e) {
                console.error("Parse error:", e, line);
            }
        }
    }
}

function handleProcessMessage(data) {
    switch (data.type) {
        case "step_start":
            addLog(data.message);
            $(`#status-${data.step}`).textContent = "⏳";
            $(`#status-${data.step}`).className = "text-xs status-running";
            break;

        case "chunk":
            // Real-time streaming: update preview as content comes in
            updatePreviewStreaming(data.content, data.step);
            break;

        case "step_end":
            $(`#status-${data.step}`).textContent = "✅";
            $(`#status-${data.step}`).className = "text-xs status-done";
            addLog(`✅ ${data.step} 完成`);
            updatePreview(data.content);
            // Remove completed step from remaining
            remainingSteps = remainingSteps.filter(s => s !== data.step);
            break;

        case "step_pause":
            addLog(`⏸ ${data.message}`);
            progressSpinner.classList.add("hidden");
            if (remainingSteps.length > 0) {
                btnNextStep.classList.remove("hidden");
                btnStop.classList.add("hidden");
            }
            break;

        case "done":
            currentNotes = data.content;
            currentFilename = data.filename;
            updatePreview(data.content);
            addLog(`📝 笔记已保存: ${data.filename}`);
            addChatMessage("ai", "笔记已生成完毕！你可以查看右侧预览，或者直接向我提问 🎉");
            break;
    }
}

// Streaming preview: append chunks incrementally
let streamBuffer = "";
function updatePreviewStreaming(chunk, step) {
    streamBuffer += chunk;
    notePreview.innerHTML = marked.parse(streamBuffer);
    notePreview.querySelectorAll("pre code").forEach(block => hljs.highlightElement(block));
    notePreview.scrollTop = notePreview.scrollHeight;
}

function addLog(message) {
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    progressLog.innerHTML += `<div><span class="text-dark-400">[${time}]</span> ${message}</div>`;
    progressLog.scrollTop = progressLog.scrollHeight;
}

// Event: Process button
btnProcess.addEventListener("click", () => {
    const content = inputContent.value.trim();
    if (!content) return alert("请先输入或上传教学文档内容");
    const steps = getSelectedSteps();
    if (steps.length === 0) return alert("请至少选择一个处理步骤");
    streamBuffer = "";
    startProcess(content, steps, getProcessMode());
});

// Event: Next Step button
btnNextStep.addEventListener("click", () => {
    const content = inputContent.value.trim();
    btnNextStep.classList.add("hidden");
    resumeProcess(content, remainingSteps, getProcessMode());
});

// Event: Stop button
btnStop.addEventListener("click", () => {
    isProcessing = false;
    addLog("⏹ 已停止处理");
    setProcessingState(false);
});

// ==================== Note Preview & Edit ====================

function updatePreview(content) {
    notePreview.innerHTML = marked.parse(content);
    notePreview.querySelectorAll("pre code").forEach(block => hljs.highlightElement(block));
    wordCount.textContent = `${content.length} 字`;
}

btnEdit.addEventListener("click", () => {
    if (isEditing) return;
    isEditing = true;
    noteEditor.value = currentNotes;
    notePreview.classList.add("hidden");
    noteEditor.classList.remove("hidden");
    btnSave.classList.remove("hidden");
    btnEdit.classList.add("hidden");
    noteEditor.focus();
});

btnSave.addEventListener("click", saveNote);

async function saveNote() {
    if (!isEditing) return;
    currentNotes = noteEditor.value;
    if (currentFilename) {
        try {
            await fetch(`/api/notes/${currentFilename}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: currentNotes }),
            });
        } catch (e) { console.error("Save error:", e); }
    }
    isEditing = false;
    updatePreview(currentNotes);
    notePreview.classList.remove("hidden");
    noteEditor.classList.add("hidden");
    btnSave.classList.add("hidden");
    btnEdit.classList.remove("hidden");
}

// Export MD
btnExportMd.addEventListener("click", () => {
    if (!currentNotes) return alert("暂无可导出的笔记");
    const blob = new Blob([currentNotes], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename || "笔记.md";
    a.click();
    URL.revokeObjectURL(url);
});

// Export HTML
btnExportHtml.addEventListener("click", () => {
    if (!currentFilename) return alert("请先保存笔记再导出");
    window.open(`/api/notes/${currentFilename}/export/html`, "_blank");
});

// ==================== Note Selection for Q&A ====================
notePreview.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text && text.length > 2) {
        selectedText = text;
        selectedTextContent.textContent = text.length > 80 ? text.substring(0, 80) + "..." : text;
        selectedTextPreview.classList.remove("hidden");
    }
});

btnClearSelection.addEventListener("click", () => {
    selectedText = "";
    selectedTextPreview.classList.add("hidden");
});

// ==================== Q&A Chat ====================
async function sendQuestion() {
    const question = chatInput.value.trim();
    if (!question) return;

    let fullQuestion = question;
    if (selectedText) {
        fullQuestion = `关于这段内容：\n> ${selectedText}\n\n我的问题：${question}`;
        selectedText = "";
        selectedTextPreview.classList.add("hidden");
    }

    addChatMessage("user", question);
    chatHistory.push({ role: "user", content: fullQuestion });
    chatInput.value = "";

    const aiMsgEl = addChatMessage("ai", "", true);

    try {
        const response = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: fullQuestion,
                notes: currentNotes,
                history: chatHistory.slice(-10)
            }),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            for (const line of text.trim().split("\n")) {
                if (!line) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.type === "chunk") {
                        fullResponse += data.content;
                        aiMsgEl.innerHTML = marked.parse(fullResponse);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                } catch (e) {}
            }
        }

        aiMsgEl.querySelectorAll("pre code").forEach(block => hljs.highlightElement(block));
        chatHistory.push({ role: "assistant", content: fullResponse });
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
                <div class="bg-accent/20 rounded-xl rounded-tr-sm px-4 py-2.5 text-sm text-dark-100 max-w-[80%] whitespace-pre-wrap">${escapeHtml(content)}</div>
            </div>`;
    } else {
        div.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-sm flex-shrink-0">AI</div>
            <div class="bg-dark-500 rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-dark-100 max-w-[80%] break-words">
                ${isPlaceholder ? '<span class="animate-pulse">思考中...</span>' : marked.parse(content)}
            </div>`;
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (isPlaceholder) return div.querySelector(".bg-dark-500");
    return div;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

btnSend.addEventListener("click", sendQuestion);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
});

btnClearChat.addEventListener("click", () => {
    chatHistory = [];
    chatMessages.innerHTML = `
        <div class="flex gap-3 chat-msg">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-sm flex-shrink-0">AI</div>
            <div class="bg-dark-500 rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-dark-100 max-w-[80%]">
                对话已清空，随时可以继续提问 😊
            </div>
        </div>`;
});

// ==================== Notes List Modal ====================
btnNotesList.addEventListener("click", async () => {
    notesModal.classList.remove("hidden");
    notesSearch.value = "";
    await loadNotesList();
    notesSearch.focus();
});

btnCloseModal.addEventListener("click", () => notesModal.classList.add("hidden"));
notesModal.addEventListener("click", (e) => { if (e.target === notesModal) notesModal.classList.add("hidden"); });

let searchTimeout;
notesSearch.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadNotesList(notesSearch.value), 300);
});

async function loadNotesList(query = "") {
    try {
        const url = query ? `/api/notes?q=${encodeURIComponent(query)}` : "/api/notes";
        const response = await fetch(url);
        const notes = await response.json();

        if (notes.length === 0) {
            notesList.innerHTML = `<div class="text-center text-dark-300 py-8">${query ? "没有匹配的笔记" : "暂无笔记"}</div>`;
            return;
        }

        notesList.innerHTML = notes.map(note => {
            const tagHtml = note.tags.slice(0, 3).map(t => `<span class="px-1.5 py-0.5 rounded bg-dark-500 text-dark-300 text-[10px]">${t}</span>`).join("");
            return `
            <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-dark-500/50 cursor-pointer transition-all note-item" data-filename="${note.filename}">
                <div class="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-lg flex-shrink-0">📄</div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-dark-100 truncate">${note.filename}</div>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-xs text-dark-400">${note.created}</span>
                        <span class="text-xs text-dark-400">${note.word_count} 字</span>
                    </div>
                    ${tagHtml ? `<div class="flex gap-1 mt-1 flex-wrap">${tagHtml}</div>` : ""}
                </div>
                <button class="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-400/10 transition-all delete-note" data-filename="${note.filename}">🗑</button>
            </div>`;
        }).join("");

        $$(".note-item").forEach(el => {
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
                } catch (e) { console.error("Load error:", e); }
            });
        });

        $$(".delete-note").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const filename = btn.dataset.filename;
                if (!confirm(`确定删除 ${filename}？`)) return;
                try {
                    await fetch(`/api/notes/${filename}`, { method: "DELETE" });
                    await loadNotesList(notesSearch.value);
                } catch (e) { console.error("Delete error:", e); }
            });
        });
    } catch (error) {
        notesList.innerHTML = '<div class="text-center text-red-400 py-8">加载失败</div>';
    }
}

// ==================== Keyboard Shortcuts ====================
document.addEventListener("keydown", (e) => {
    // Ctrl+Enter: Start processing
    if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (!isProcessing) btnProcess.click();
    }
    // Ctrl+S: Save note
    if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        if (isEditing) saveNote();
    }
    // Esc: Close modal
    if (e.key === "Escape") {
        if (!notesModal.classList.contains("hidden")) {
            notesModal.classList.add("hidden");
        }
    }
});

// ==================== Init ====================
marked.setOptions({ breaks: true, gfm: true });
