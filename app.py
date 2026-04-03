import os
import threading
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
import sqlite3
import cloudinary
import cloudinary.uploader
import cloudinary.api

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "grupoas_multi_secret_2025")

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# ---------------------------------------------------------------------------
# Cloudinary
# ---------------------------------------------------------------------------

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
    api_key=os.environ.get("CLOUDINARY_API_KEY", ""),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET", ""),
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AUTHORIZED_USERS = ["Isac", "Isadora"]

PRODUCTS = [
    "Baby Look",
    "Body Manga Curta",
    "Body Gola Quadrada",
    "Body Gola Alta",
    "Baby Tee",
    "Blusinha Regata",
    "Mula Manca",
    "Top Academia",
    "Body Regata",
    "Top Faixa",
    "Blusinha T-Shirt",
    "Blusinha Costa Nua",
]

FISCAL_DEFAULTS = [
    ("NCM", "63090010"),
    ("Origem", "0 – Nacional, exceto as indicadas em outras classificações"),
    ("CFOP (Mesmo Estado)", "5102"),
    ("COSN", "102 – Tributada pelo Simples Nacional"),
    ("CFOP (Estado Diferente)", "6102"),
    ("Unidade de Medida", "CJ (Conjunto)"),
    ("CEST", "28.057.00"),
]

ACCOUNTS_DEFAULTS = [
    ("As03",           "+55 11 970486514",              "William2525"),
    ("Gp",             "+55 11 959522331",              "Ab84777597aa"),
    ("Rosa",           "+55 11 961512212",              "A28071294Bb"),
    ("Grupo As",       "+55 11 951639438",              "A280712a"),
    ("Nova AS",        "+55 11 951662621",              "a28071409A"),
    ("Luffymodas121",  "luizfarias.180544@gmail.com",   "Edu0902134@"),
    ("ASconfecções",   "+55 11 982493765",              "AS280712a"),
    ("Cn.modas",       "+55 11 982555454",              "Neves.20211"),
]

DATABASE = os.path.join(os.path.dirname(__file__), "instance", "database.db")

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

chat_messages = []
chat_lock = threading.Lock()
online_users = {}          # sid -> username
ttt_state = {              # online Jogo da Velha state
    "board": [None] * 9,
    "players": {},         # "X" -> sid, "O" -> sid
    "current_turn": "X",
    "active": False,
    "challenger": None,
}

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
    conn = get_db()
    c = conn.cursor()

    # Products / price table
    c.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            price_final REAL DEFAULT 0,
            price_multiplied REAL DEFAULT 0
        )
    """)
    for name in PRODUCTS:
        c.execute("INSERT OR IGNORE INTO products (name) VALUES (?)", (name,))

    # Fiscal info
    c.execute("""
        CREATE TABLE IF NOT EXISTS fiscal_info (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            field_name TEXT UNIQUE NOT NULL,
            field_value TEXT NOT NULL
        )
    """)
    for name, value in FISCAL_DEFAULTS:
        c.execute(
            "INSERT OR IGNORE INTO fiscal_info (field_name, field_value) VALUES (?, ?)",
            (name, value),
        )

    # Accounts
    c.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name TEXT UNIQUE NOT NULL,
            login TEXT NOT NULL,
            password TEXT NOT NULL
        )
    """)
    for name, login, password in ACCOUNTS_DEFAULTS:
        c.execute(
            "INSERT OR IGNORE INTO accounts (account_name, login, password) VALUES (?, ?, ?)",
            (name, login, password),
        )

    # Shared files
    c.execute("""
        CREATE TABLE IF NOT EXISTS shared_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            url TEXT NOT NULL,
            public_id TEXT,
            file_type TEXT NOT NULL,
            uploaded_by TEXT NOT NULL,
            uploaded_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def logged_in():
    return session.get("username") in AUTHORIZED_USERS


def require_login(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not logged_in():
            return jsonify({"error": "Não autorizado"}), 401
        return fn(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Chat cleanup background thread
# ---------------------------------------------------------------------------

def chat_cleanup_loop():
    while True:
        time.sleep(300)  # 5 minutes
        with chat_lock:
            chat_messages.clear()
        socketio.emit("chat_cleared", {}, to=None)


cleanup_thread = threading.Thread(target=chat_cleanup_loop, daemon=True)
cleanup_thread.start()


# ---------------------------------------------------------------------------
# Routes – pages
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Routes – auth
# ---------------------------------------------------------------------------

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    if username in AUTHORIZED_USERS:
        session["username"] = username
        return jsonify({"ok": True, "username": username})
    return jsonify({"ok": False, "error": "Usuário não autorizado"}), 403


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
def me():
    if logged_in():
        return jsonify({"username": session["username"]})
    return jsonify({"username": None})


# ---------------------------------------------------------------------------
# Routes – price table
# ---------------------------------------------------------------------------

@app.route("/api/products")
@require_login
def get_products():
    conn = get_db()
    rows = conn.execute("SELECT * FROM products ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/products/<int:product_id>", methods=["PUT"])
@require_login
def update_product(product_id):
    data = request.get_json()
    price_final = data.get("price_final")
    price_multiplied = data.get("price_multiplied")

    if price_final is not None and float(price_final) < 0:
        return jsonify({"error": "Valor inválido: preço não pode ser negativo"}), 400
    if price_multiplied is not None and float(price_multiplied) < 0:
        return jsonify({"error": "Valor inválido: preço não pode ser negativo"}), 400

    conn = get_db()
    conn.execute(
        "UPDATE products SET price_final=?, price_multiplied=? WHERE id=?",
        (price_final, price_multiplied, product_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


# ---------------------------------------------------------------------------
# Routes – fiscal info
# ---------------------------------------------------------------------------

@app.route("/api/fiscal")
@require_login
def get_fiscal():
    conn = get_db()
    rows = conn.execute("SELECT * FROM fiscal_info ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/fiscal/<int:fiscal_id>", methods=["PUT"])
@require_login
def update_fiscal(fiscal_id):
    data = request.get_json()
    field_value = data.get("field_value", "").strip()
    conn = get_db()
    conn.execute(
        "UPDATE fiscal_info SET field_value=? WHERE id=?",
        (field_value, fiscal_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM fiscal_info WHERE id=?", (fiscal_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


# ---------------------------------------------------------------------------
# Routes – accounts
# ---------------------------------------------------------------------------

@app.route("/api/accounts")
@require_login
def get_accounts():
    conn = get_db()
    rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/accounts/<int:account_id>", methods=["PUT"])
@require_login
def update_account(account_id):
    data = request.get_json()
    login = data.get("login", "").strip()
    password = data.get("password", "").strip()
    conn = get_db()
    conn.execute(
        "UPDATE accounts SET login=?, password=? WHERE id=?",
        (login, password, account_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


# ---------------------------------------------------------------------------
# Routes – shared files
# ---------------------------------------------------------------------------

@app.route("/api/files")
@require_login
def get_files():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM shared_files ORDER BY uploaded_at DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/files/upload", methods=["POST"])
@require_login
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400

    f = request.files["file"]
    username = session["username"]

    upload_result = cloudinary.uploader.upload(
        f,
        resource_type="auto",
        folder="grupoas_multi",
    )

    url = upload_result.get("secure_url")
    public_id = upload_result.get("public_id")
    resource_type = upload_result.get("resource_type", "raw")
    uploaded_at = datetime.now().isoformat()

    file_type = "image" if resource_type == "image" else "video" if resource_type == "video" else "file"

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO shared_files (filename, url, public_id, file_type, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?)",
        (f.filename, url, public_id, file_type, username, uploaded_at),
    )
    file_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM shared_files WHERE id=?", (file_id,)).fetchone()
    conn.close()

    file_data = dict(row)
    socketio.emit("file_added", file_data)
    return jsonify(file_data), 201


@app.route("/api/files/<int:file_id>", methods=["DELETE"])
@require_login
def delete_file(file_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM shared_files WHERE id=?", (file_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Arquivo não encontrado"}), 404

    if row["public_id"]:
        try:
            cloudinary.api.delete_resources([row["public_id"]], resource_type="raw")
            cloudinary.api.delete_resources([row["public_id"]], resource_type="image")
        except Exception:
            pass

    conn.execute("DELETE FROM shared_files WHERE id=?", (file_id,))
    conn.commit()
    conn.close()

    socketio.emit("file_removed", {"id": file_id})
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Socket.IO – connection tracking
# ---------------------------------------------------------------------------

@socketio.on("connect")
def on_connect():
    username = session.get("username")
    if username:
        online_users[request.sid] = username
        emit("online_users", list(set(online_users.values())), broadcast=True)


@socketio.on("disconnect")
def on_disconnect():
    username = online_users.pop(request.sid, None)
    if username:
        emit("online_users", list(set(online_users.values())), broadcast=True)
        # If player disconnects during ttt, reset game
        if request.sid in ttt_state["players"].values():
            _reset_ttt()
            socketio.emit("ttt_reset", {"reason": "Jogador desconectado"})


# ---------------------------------------------------------------------------
# Socket.IO – chat
# ---------------------------------------------------------------------------

@socketio.on("chat_send")
def on_chat_send(data):
    username = session.get("username")
    if not username:
        return
    msg = {
        "username": username,
        "text": data.get("text", "").strip(),
        "time": datetime.now().strftime("%H:%M"),
    }
    if not msg["text"]:
        return
    with chat_lock:
        chat_messages.append(msg)
    emit("chat_message", msg, broadcast=True)


@socketio.on("chat_request_history")
def on_chat_history():
    with chat_lock:
        emit("chat_history", list(chat_messages))


# ---------------------------------------------------------------------------
# Socket.IO – Jogo da Velha online
# ---------------------------------------------------------------------------

def _reset_ttt():
    ttt_state["board"] = [None] * 9
    ttt_state["players"] = {}
    ttt_state["current_turn"] = "X"
    ttt_state["active"] = False
    ttt_state["challenger"] = None


@socketio.on("ttt_challenge")
def on_ttt_challenge(data):
    username = session.get("username")
    if not username:
        return
    ttt_state["challenger"] = {"sid": request.sid, "username": username}
    emit("ttt_challenged", {"from": username}, broadcast=True, include_self=False)


@socketio.on("ttt_accept")
def on_ttt_accept():
    username = session.get("username")
    challenger = ttt_state.get("challenger")
    if not username or not challenger or ttt_state["active"]:
        return

    _reset_ttt()
    ttt_state["active"] = True
    ttt_state["players"]["X"] = challenger["sid"]
    ttt_state["players"]["O"] = request.sid
    ttt_state["current_turn"] = "X"

    socketio.emit("ttt_start", {
        "X": challenger["username"],
        "O": username,
        "current_turn": "X",
    })


@socketio.on("ttt_move")
def on_ttt_move(data):
    username = session.get("username")
    if not username or not ttt_state["active"]:
        return

    index = data.get("index")
    # Validate it's this player's turn
    current_symbol = ttt_state["current_turn"]
    if ttt_state["players"].get(current_symbol) != request.sid:
        return
    if ttt_state["board"][index] is not None:
        return

    ttt_state["board"][index] = current_symbol
    next_turn = "O" if current_symbol == "X" else "X"
    ttt_state["current_turn"] = next_turn

    winner = _check_ttt_winner(ttt_state["board"])
    draw = winner is None and None not in ttt_state["board"]

    socketio.emit("ttt_update", {
        "board": ttt_state["board"],
        "current_turn": next_turn,
        "winner": winner,
        "draw": draw,
    })

    if winner or draw:
        _reset_ttt()


@socketio.on("ttt_decline")
def on_ttt_decline():
    username = session.get("username")
    ttt_state["challenger"] = None
    emit("ttt_declined", {"by": username}, broadcast=True)


def _check_ttt_winner(board):
    wins = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),
        (0, 3, 6), (1, 4, 7), (2, 5, 8),
        (0, 4, 8), (2, 4, 6),
    ]
    for a, b, c in wins:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    return None


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)

init_db()
