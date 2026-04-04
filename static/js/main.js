/* ============================================================
   main.js – Lógica principal, autenticação, navegação
   ============================================================ */

"use strict";

// ── Estado global ──────────────────────────────────────────
const App = {
  username: null,
  socket: null,
  currentTab: "dashboard",
};

// ── Socket.IO ──────────────────────────────────────────────
function connectSocket() {
  App.socket = io({ transports: ["websocket", "polling"] });

  App.socket.on("online_users", (users) => {
    const count = users.length;
    document.getElementById("online-count").textContent =
      count === 1 ? "1 online" : `${count} online`;
  });

  // Delega eventos para os módulos
  App.socket.on("chat_message",  (msg) => Chat.onMessage(msg));
  App.socket.on("chat_history",  (msgs) => Chat.onHistory(msgs));
  App.socket.on("chat_cleared",  () => Chat.onCleared());
  App.socket.on("file_added",    (f) => Files.onAdded(f));
  App.socket.on("file_removed",  (d) => Files.onRemoved(d.id));
  App.socket.on("ttt_challenged", (d) => Games.ttt.onChallenged(d));
  App.socket.on("ttt_declined",   (d) => Games.ttt.onDeclined(d));
  App.socket.on("ttt_start",      (d) => Games.ttt.onStart(d));
  App.socket.on("ttt_update",     (d) => Games.ttt.onUpdate(d));
  App.socket.on("ttt_reset",      (d) => Games.ttt.onReset(d));
}

// ── Toast ──────────────────────────────────────────────────
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  toast.innerHTML = `<span>${icons[type] || ""}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ── Copiar para área de transferência ─────────────────────
function copyToClipboard(text) {
  navigator.clipboard.writeText(String(text)).then(() => {
    showToast("Copiado!", "success");
  }).catch(() => {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = String(text);
    ta.style.cssText = "position:fixed;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast("Copiado!", "success");
  });
}

// ── Lightbox ───────────────────────────────────────────────
function openLightbox(src) {
  document.getElementById("lightbox-img").src = src;
  document.getElementById("lightbox").classList.remove("hidden");
}
function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
}

// ── Navegação entre abas ───────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll(".page").forEach((s) => s.classList.add("hidden"));
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));

  const section = document.getElementById(`tab-${tabName}`);
  const btn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
  if (section) section.classList.remove("hidden");
  if (btn) btn.classList.add("active");

  App.currentTab = tabName;

  // Carrega dados da aba ao trocar
  if (tabName === "price" && typeof PriceTable !== "undefined") PriceTable.load();
  if (tabName === "fiscal" && typeof Fiscal !== "undefined") Fiscal.load();
  if (tabName === "accounts" && typeof Accounts !== "undefined") Accounts.load();
}

// ── Login ──────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById("login-input").value.trim();
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  if (!username) {
    errorEl.textContent = "Digite seu nome de usuário.";
    return;
  }

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();

  if (data.ok) {
    App.username = data.username;
    document.getElementById("header-username").textContent = data.username;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.add("visible");
    connectSocket();
    // Carrega dados iniciais
    if (typeof Files !== "undefined") Files.load();
    if (typeof Chat !== "undefined") App.socket.emit("chat_request_history");
  } else {
    errorEl.textContent = data.error || "Usuário não autorizado.";
  }
}

// ── Logout ─────────────────────────────────────────────────
async function doLogout() {
  await fetch("/api/logout", { method: "POST" });
  if (App.socket) App.socket.disconnect();
  App.username = null;
  document.getElementById("app").classList.remove("visible");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("login-input").value = "";
  document.getElementById("login-error").textContent = "";
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Verifica sessão ativa
  const res = await fetch("/api/me");
  const data = await res.json();
  if (data.username) {
    App.username = data.username;
    document.getElementById("header-username").textContent = data.username;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.add("visible");
    connectSocket();
    if (typeof Files !== "undefined") Files.load();
    if (typeof Chat !== "undefined") App.socket.emit("chat_request_history");
  }

  // Eventos de login
  document.getElementById("login-btn").addEventListener("click", doLogin);
  document.getElementById("login-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });

  // Logout
  document.getElementById("logout-btn").addEventListener("click", doLogout);

  // Nav tabs
  document.getElementById("nav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) switchTab(btn.dataset.tab);
  });

  // Jogo da Velha modal
  document.getElementById("ttt-accept-btn").addEventListener("click", () => {
    App.socket.emit("ttt_accept");
    document.getElementById("ttt-challenge-modal").classList.add("hidden");
  });
  document.getElementById("ttt-decline-btn").addEventListener("click", () => {
    App.socket.emit("ttt_decline");
    document.getElementById("ttt-challenge-modal").classList.add("hidden");
  });

  // Inicializa jogo padrão (Jogo da Velha)
  setTimeout(() => {
    if (typeof Games !== "undefined") Games.selectGame("ttt");
  }, 100);
});
