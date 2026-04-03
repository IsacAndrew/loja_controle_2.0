/* ============================================================
   accounts.js – Gerenciamento de contas: login/senha
   ============================================================ */

"use strict";

const Accounts = (() => {
  let accountsData = [];
  let editingId = null;
  let visiblePasswords = new Set();

  function maskPassword(pwd) {
    return "•".repeat(Math.min(pwd.length, 10));
  }

  function buildRow(account) {
    const isEditing = editingId === account.id;
    const showPwd = visiblePasswords.has(account.id);
    const tr = document.createElement("tr");

    if (!isEditing) {
      tr.innerHTML = `
        <td style="font-weight:600;">${account.account_name}</td>
        <td>
          <span class="copy-value" title="Clique para copiar"
            onclick="copyToClipboard('${account.login.replace(/'/g, "\\'")}')">
            ${account.login}
          </span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="copy-value" title="Clique para copiar"
              onclick="copyToClipboard('${account.password.replace(/'/g, "\\'")}')">
              ${showPwd ? account.password : maskPassword(account.password)}
            </span>
            <button class="btn btn-ghost btn-sm" style="padding:3px 7px;font-size:0.72rem;"
              onclick="Accounts.togglePassword(${account.id})">
              ${showPwd ? "🙈" : "👁"}
            </button>
          </div>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="Accounts.startEdit(${account.id})">✏️ Editar</button>
        </td>
      `;
    } else {
      tr.innerHTML = `
        <td style="font-weight:600;">${account.account_name}</td>
        <td>
          <input class="inline-input" id="acc-login-${account.id}" type="text"
            value="${account.login}" placeholder="Login" />
        </td>
        <td>
          <input class="inline-input" id="acc-pwd-${account.id}" type="text"
            value="${account.password}" placeholder="Senha" />
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-success btn-sm" onclick="Accounts.save(${account.id})">✓ Salvar</button>
            <button class="btn btn-ghost btn-sm" onclick="Accounts.cancelEdit()">Cancelar</button>
          </div>
        </td>
      `;
    }
    return tr;
  }

  function render() {
    const tbody = document.getElementById("accounts-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    accountsData.forEach((a) => tbody.appendChild(buildRow(a)));
  }

  async function load() {
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) return;
      accountsData = await res.json();
      render();
    } catch (err) {
      console.error("Erro ao carregar contas:", err);
    }
  }

  function togglePassword(id) {
    if (visiblePasswords.has(id)) visiblePasswords.delete(id);
    else visiblePasswords.add(id);
    render();
  }

  function startEdit(id) {
    editingId = id;
    render();
    requestAnimationFrame(() => {
      document.getElementById(`acc-login-${id}`)?.focus();
    });
  }

  function cancelEdit() {
    editingId = null;
    render();
  }

  async function save(id) {
    const login    = document.getElementById(`acc-login-${id}`)?.value.trim();
    const password = document.getElementById(`acc-pwd-${id}`)?.value.trim();

    if (!login || !password) {
      showToast("Login e senha não podem estar vazios.", "error");
      return;
    }

    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      if (!res.ok) { showToast("Erro ao salvar conta.", "error"); return; }
      const updated = await res.json();
      accountsData = accountsData.map((a) => (a.id === id ? updated : a));
      editingId = null;
      render();
      showToast("Conta atualizada!", "success");
    } catch {
      showToast("Erro de conexão.", "error");
    }
  }

  return { load, togglePassword, startEdit, cancelEdit, save };
})();
