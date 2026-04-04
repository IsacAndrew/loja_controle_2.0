/* ============================================================
   files.js – Compartilhamento de arquivos em tempo real
   ============================================================ */

"use strict";

const Files = (() => {
  let filesList = [];

  function fileIcon(type) {
    if (type === "image") return "🖼️";
    if (type === "video") return "🎬";
    return "📄";
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  function buildFileEl(file) {
    const el = document.createElement("div");
    el.className = "file-item";
    el.dataset.fileId = file.id;

    let preview = "";
    if (file.file_type === "image") {
      preview = `<img class="file-img-preview" src="${file.url}" alt="${file.filename}" onclick="openLightbox('${file.url}')" />`;
    }

    el.innerHTML = `
      <div class="file-item-icon">${fileIcon(file.file_type)}</div>
      <div class="file-item-info">
        <div class="file-item-name" title="${file.filename}">${file.filename}</div>
        <div class="file-item-meta">Por ${file.uploaded_by} · ${formatDate(file.uploaded_at)}</div>
        ${preview}
      </div>
      <div class="file-item-actions">
        <a href="${file.url}" target="_blank" download="${file.filename}" class="btn btn-ghost btn-sm" title="Download">⬇</a>
        <button class="btn btn-danger btn-sm file-delete-btn" data-id="${file.id}" title="Excluir">🗑</button>
      </div>
    `;

    el.querySelector(".file-delete-btn").addEventListener("click", () => deleteFile(file.id));
    return el;
  }

  function render() {
    const container = document.getElementById("files-list");
    if (!container) return;

    if (!filesList.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;">Nenhum arquivo enviado.</div>';
      return;
    }

    container.innerHTML = "";
    filesList.forEach((f) => container.appendChild(buildFileEl(f)));
  }

  async function load() {
    try {
      const res = await fetch("/api/files");
      if (!res.ok) return;
      filesList = await res.json();
      render();
    } catch (err) {
      console.error("Erro ao carregar arquivos:", err);
    }
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    showToast("Enviando arquivo...", "info");
    try {
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || "Erro ao enviar arquivo", "error");
        return;
      }
      // O arquivo aparecerá via socket event file_added
    } catch (err) {
      showToast("Erro de conexão ao enviar arquivo", "error");
    }
  }

  async function deleteFile(id) {
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (!res.ok) { showToast("Erro ao excluir arquivo", "error"); return; }
      // Aparecerá via socket event file_removed
    } catch {
      showToast("Erro ao excluir arquivo", "error");
    }
  }

  // Socket events
  function onAdded(file) {
    // Remove entry se já existe (evita duplicata)
    filesList = filesList.filter((f) => f.id !== file.id);
    filesList.unshift(file);
    render();
    if (file.uploaded_by !== App.username) {
      showToast(`📎 ${file.uploaded_by} enviou: ${file.filename}`, "info");
    }
  }

  function onRemoved(id) {
    filesList = filesList.filter((f) => f.id !== id);
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("file-input");
    const dropArea = document.getElementById("file-drop-area");

    input?.addEventListener("change", () => {
      if (input.files.length) { uploadFile(input.files[0]); input.value = ""; }
    });

    // Drag & drop
    dropArea?.addEventListener("dragover", (e) => { e.preventDefault(); dropArea.style.borderColor = "var(--accent-bright)"; });
    dropArea?.addEventListener("dragleave", () => { dropArea.style.borderColor = ""; });
    dropArea?.addEventListener("drop", (e) => {
      e.preventDefault();
      dropArea.style.borderColor = "";
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    });
  });

  return { load, onAdded, onRemoved };
})();
