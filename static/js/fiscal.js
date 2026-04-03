/* ============================================================
   fiscal.js – Informações fiscais: exibição, cópia e edição
   ============================================================ */

"use strict";

const Fiscal = (() => {
  let fiscalData = [];
  let editingId = null;

  function buildRow(item) {
    const isEditing = editingId === item.id;
    const tr = document.createElement("tr");

    if (!isEditing) {
      tr.innerHTML = `
        <td style="font-weight:500;">${item.field_name}</td>
        <td>
          <span class="copy-value" title="Clique para copiar"
            onclick="copyToClipboard('${item.field_value.replace(/'/g, "\\'")}')">
            ${item.field_value}
          </span>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="Fiscal.startEdit(${item.id})">✏️ Editar</button>
        </td>
      `;
    } else {
      tr.innerHTML = `
        <td style="font-weight:500;">${item.field_name}</td>
        <td>
          <div class="inline-edit-row">
            <input class="inline-input" id="fiscal-input-${item.id}" type="text" value="${item.field_value}" />
          </div>
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-success btn-sm" onclick="Fiscal.save(${item.id})">✓ Salvar</button>
            <button class="btn btn-ghost btn-sm" onclick="Fiscal.cancelEdit()">Cancelar</button>
          </div>
        </td>
      `;
    }
    return tr;
  }

  function render() {
    const tbody = document.getElementById("fiscal-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    fiscalData.forEach((item) => tbody.appendChild(buildRow(item)));
  }

  async function load() {
    try {
      const res = await fetch("/api/fiscal");
      if (!res.ok) return;
      fiscalData = await res.json();
      render();
    } catch (err) {
      console.error("Erro ao carregar dados fiscais:", err);
    }
  }

  function startEdit(id) {
    editingId = id;
    render();
    requestAnimationFrame(() => {
      document.getElementById(`fiscal-input-${id}`)?.focus();
    });
  }

  function cancelEdit() {
    editingId = null;
    render();
  }

  async function save(id) {
    const input = document.getElementById(`fiscal-input-${id}`);
    const value = input?.value.trim();
    if (value === undefined || value === "") {
      showToast("O campo não pode estar vazio.", "error");
      return;
    }

    try {
      const res = await fetch(`/api/fiscal/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field_value: value }),
      });
      if (!res.ok) {
        showToast("Erro ao salvar.", "error"); return;
      }
      const updated = await res.json();
      fiscalData = fiscalData.map((f) => (f.id === id ? updated : f));
      editingId = null;
      render();
      showToast("Informação fiscal salva!", "success");
    } catch {
      showToast("Erro de conexão.", "error");
    }
  }

  return { load, startEdit, cancelEdit, save };
})();
