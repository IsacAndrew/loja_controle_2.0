/* ============================================================
   chat.js – Chat ao vivo em tempo real
   ============================================================ */

"use strict";

const Chat = (() => {
  function buildMsgEl(msg) {
    const isMine = msg.username === App.username;
    const initials = msg.username.substring(0, 2).toUpperCase();
    const el = document.createElement("div");
    el.className = "chat-msg";
    el.style.flexDirection = isMine ? "row-reverse" : "row";
    el.innerHTML = `
      <div class="chat-msg-avatar">${initials}</div>
      <div class="chat-msg-bubble ${isMine ? "mine" : ""}">
        <div class="chat-msg-header">${isMine ? "Você" : msg.username} · ${msg.time}</div>
        <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
      </div>
    `;
    return el;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scrollToBottom() {
    const box = document.getElementById("chat-box");
    if (box) box.scrollTop = box.scrollHeight;
  }

  function clearEmpty() {
    const box = document.getElementById("chat-box");
    if (!box) return;
    const empty = box.querySelector("[style*='text-align:center']");
    if (empty) empty.remove();
  }

  function onMessage(msg) {
    const box = document.getElementById("chat-box");
    if (!box) return;
    clearEmpty();
    box.appendChild(buildMsgEl(msg));
    scrollToBottom();
  }

  function onHistory(msgs) {
    const box = document.getElementById("chat-box");
    if (!box) return;
    box.innerHTML = "";
    if (!msgs.length) {
      box.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;margin:auto;">Nenhuma mensagem ainda.</div>';
      return;
    }
    msgs.forEach((m) => box.appendChild(buildMsgEl(m)));
    scrollToBottom();
  }

  function onCleared() {
    const box = document.getElementById("chat-box");
    if (!box) return;
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;margin:auto;">Nenhuma mensagem ainda.</div>';
  }

  function sendMessage() {
    const input = document.getElementById("chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    App.socket.emit("chat_send", { text });
    input.value = "";
    input.focus();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("chat-send-btn")?.addEventListener("click", sendMessage);
    document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  });

  return { onMessage, onHistory, onCleared };
})();
