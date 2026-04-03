/* ============================================================
   price-table.js – Tabela de preços bidirecional
   ============================================================ */

"use strict";

const PriceTable = (() => {
  let products = [];
  let editingId = null;

  // ── Formata valor para exibição ─────────────────────────
  function formatBRL(val) {
    if (!val && val !== 0) return "R$ 0,00";
    return "R$ " + Number(val).toFixed(2).replace(".", ",");
  }

  // ── Constrói card de produto ─────────────────────────────
  function buildCard(product) {
    const isEditing = editingId === product.id;
    const card = document.createElement("div");
    card.className = "price-card";
    card.dataset.id = product.id;

    if (!isEditing) {
      card.innerHTML = `
        <div class="price-card-name">${product.name}</div>
        <div class="price-row">
          <span class="price-label">Preço Final</span>
          <div class="price-value-wrap">
            <span class="copy-value" title="Clique para copiar" onclick="copyToClipboard('${product.price_final}')">
              ${formatBRL(product.price_final)}
            </span>
          </div>
        </div>
        <div class="price-row">
          <span class="price-label">Preço Multiplicado</span>
          <div class="price-value-wrap">
            <span class="copy-value" title="Clique para copiar" onclick="copyToClipboard('${product.price_multiplied}')">
              ${formatBRL(product.price_multiplied)}
            </span>
          </div>
        </div>
        <div style="margin-top:12px;">
          <button class="btn btn-ghost btn-sm" onclick="PriceTable.startEdit(${product.id})">✏️ Editar</button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="price-card-name">${product.name}</div>
        <div class="price-edit-row">
          <div class="price-input-pair">
            <label>Preço Final (R$)</label>
            <input type="number" class="input" id="pf-final-${product.id}" step="0.01" min="0"
              value="${product.price_final || ''}" placeholder="0,00" />
          </div>
          <div class="price-input-pair">
            <label>Preço Multiplicado (R$)</label>
            <input type="number" class="input" id="pf-mult-${product.id}" step="0.01" min="0"
              value="${product.price_multiplied || ''}" placeholder="0,00" />
          </div>
          <div id="price-error-${product.id}" style="font-size:0.78rem;color:var(--error);min-height:16px;"></div>
          <div class="price-actions">
            <button class="btn btn-success btn-sm" onclick="PriceTable.save(${product.id})">✓ Salvar</button>
            <button class="btn btn-ghost btn-sm" onclick="PriceTable.cancelEdit()">Cancelar</button>
          </div>
        </div>
      `;

      // Bind bidirecional após inserir no DOM
      requestAnimationFrame(() => {
        const finalInput = document.getElementById(`pf-final-${product.id}`);
        const multInput  = document.getElementById(`pf-mult-${product.id}`);

        finalInput?.addEventListener("input", () => {
          const val = parseFloat(finalInput.value);
          const errEl = document.getElementById(`price-error-${product.id}`);
          if (finalInput.value !== "" && val < 0) {
            errEl.textContent = "Valor inválido: preço não pode ser negativo.";
            multInput.value = "";
            return;
          }
          errEl.textContent = "";
          if (!isNaN(val) && val >= 0) {
            multInput.value = (val * 2).toFixed(2);
          } else {
            multInput.value = "";
          }
        });

        multInput?.addEventListener("input", () => {
          const val = parseFloat(multInput.value);
          const errEl = document.getElementById(`price-error-${product.id}`);
          if (multInput.value !== "" && val < 0) {
            errEl.textContent = "Valor inválido: preço não pode ser negativo.";
            finalInput.value = "";
            return;
          }
          errEl.textContent = "";
          if (!isNaN(val) && val >= 0) {
            finalInput.value = (val / 2).toFixed(2);
          } else {
            finalInput.value = "";
          }
        });
      });
    }

    return card;
  }

  // ── Renderiza grid completo ──────────────────────────────
  function render() {
    const grid = document.getElementById("price-grid");
    if (!grid) return;
    grid.innerHTML = "";
    products.forEach((p) => grid.appendChild(buildCard(p)));
  }

  // ── Carrega dados da API ─────────────────────────────────
  async function load() {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) return;
      products = await res.json();
      render();
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
    }
  }

  // ── Iniciar edição ───────────────────────────────────────
  function startEdit(id) {
    editingId = id;
    render();
  }

  function cancelEdit() {
    editingId = null;
    render();
  }

  // ── Salvar ───────────────────────────────────────────────
  async function save(id) {
    const errEl = document.getElementById(`price-error-${id}`);
    const finalInput = document.getElementById(`pf-final-${id}`);
    const multInput  = document.getElementById(`pf-mult-${id}`);

    const priceFinal = parseFloat(finalInput?.value) || 0;
    const priceMult  = parseFloat(multInput?.value) || 0;

    if (priceFinal < 0 || priceMult < 0) {
      if (errEl) errEl.textContent = "Valor inválido: preço não pode ser negativo.";
      return;
    }

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_final: priceFinal, price_multiplied: priceMult }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (errEl) errEl.textContent = err.error || "Erro ao salvar.";
        return;
      }
      const updated = await res.json();
      products = products.map((p) => (p.id === id ? updated : p));
      editingId = null;
      render();
      showToast("Preço salvo com sucesso!", "success");
    } catch {
      if (errEl) errEl.textContent = "Erro de conexão.";
    }
  }

  return { load, startEdit, cancelEdit, save };
})();
