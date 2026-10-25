/* Banca Hípica P2P — núcleo de la SPA: auth, navegación y vistas de usuario. */
"use strict";

/* ══════════════ Sistema de Notificaciones Toast y Audio ══════════════ */
let audioCtx = null;
let _toastTimer = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}
document.addEventListener("click", initAudio, { once: true });

function playNotificationSound(type = "success") {
  try {
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.08);
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(300, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    }
  } catch (_) {}
}

function notifyUser(title, message, category = "success") {
  playNotificationSound(category === "success" ? "success" : "error");

  const toastEl = document.getElementById("toast");
  if (!toastEl) return;

  let bgClass = "bg-slate-900 text-white border-slate-800";
  let icon = "🔔";

  if (category === "success") {
    bgClass = "bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/20";
    icon = "🏆";
  } else if (category === "error" || category === "err") {
    bgClass = "bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/20";
    icon = "⚠️";
  } else if (category === "info") {
    bgClass = "bg-teal-600 text-white border-teal-500 shadow-lg shadow-teal-900/20";
    icon = "🎯";
  }

  toastEl.className = `fixed bottom-20 inset-x-4 mx-auto max-w-sm z-50 p-3.5 rounded-2xl border shadow-2xl flex items-center gap-3 transition-all duration-300 ${bgClass}`;
  toastEl.innerHTML = `
    <span class="text-2xl shrink-0">${icon}</span>
    <div class="min-w-0 flex-1">
      <p class="font-black text-xs leading-tight">${esc(title)}</p>
      <p class="text-[11px] opacity-90 leading-tight mt-0.5 truncate">${esc(message)}</p>
    </div>
  `;
  toastEl.style.display = "flex";

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toastEl.style.display = "none";
  }, 4000);
}

function toast(message, type = "ok") {
  let category = "success";
  let title = "¡Éxito!";

  if (type === "err" || type === "error") {
    category = "error";
    title = "Atención";
  } else if (type === "info") {
    category = "info";
    title = "Aviso";
  }

  notifyUser(title, message, category);
}

  // ... resto del código existente de checkNotifications ...
/* ══════════════ Sistema Inteligente de Notificaciones y Sondeo ══════════════ */
let lastKnownDuelsState = {};
let unreadNotificationsList = [];

async function checkNotifications() {
  if (!App.user) return;
  try {
    let newAlertsFound = false;
    const badgeEl = document.getElementById("notification-badge");
    const listEl = document.getElementById("notification-list");
    if (!badgeEl || !listEl) return;

    // -------------------------------------------------------------
    // 1. NOTIFICACIONES DE DUELOS (Para todos los usuarios)
    // -------------------------------------------------------------
    const duels = await API.get("/duels/mine").catch(() => []);
    duels.forEach(d => {
      const prevStatus = lastKnownDuelsState[d.id];
      if (prevStatus && prevStatus !== d.status) {
        newAlertsFound = true;
        const DUEL_NAMES = {
          1: "PELO a PELO", 2: "1y2N", 3: "2N", 4: "2y2N", 5: "2 PUESTOS",
          6: "2y3N", 7: "3N", 8: "3y3N", 9: "3 PUESTOS", 10: "3y4N",
          11: "4N", 12: "4y4N", 13: "4 PUESTOS", 14: "4y5N", 15: "5N",
          16: "5y5N", 17: "5 PUESTOS", 18: "MARCAS", 19: "MOROCHA"
        };
        const tipoDuelo = (typeof d.duel_type === "string" && d.duel_type) || DUEL_NAMES[d.duel_type_id] || d.type || d.name || "Duelo";
        const numCarrera = d.race_number ? `Carrera ${d.race_number}` : "";

        let msg = `¡Tu duelo #${d.id} ha sido actualizado!`;
        if (d.status === "ACTIVE") {
          msg = numCarrera ? `¡Tu duelo de ${tipoDuelo} en la ${numCarrera} ha sido aceptado! ⚔️` : `¡Tu duelo de ${tipoDuelo} ha sido aceptado! ⚔️`;
        } else if (d.status === "RESOLVED") {
          msg = numCarrera ? `¡Tu duelo de ${tipoDuelo} en la ${numCarrera} ha sido resuelto! 🏁` : `¡Tu duelo de ${tipoDuelo} ha sido resuelto! 🏁`;
        }
        
        unreadNotificationsList.unshift({
          id: `duel_${d.id}`,
          targetView: "my-duels",
          message: msg,
          created_at: "Hace un momento",
          is_read: false
        });
      }
      lastKnownDuelsState[d.id] = d.status;
    });

    // -------------------------------------------------------------
    // 2. RECARGAS PERSONALES (Para el usuario depositante)
    const myTopups = await API.get("/payments/topups").catch(() => []);
    myTopups.forEach(t => {
      const topupKey = `topup_status_${t.id}`;
      const prevTopupStatus = lastKnownDuelsState[topupKey];
      
      if (prevTopupStatus && prevTopupStatus !== t.status) {
        newAlertsFound = true;
        const montoStr = t.amount ? `$${Number(t.amount).toFixed(2)}` : "";
        
        let msg = `Tu recarga de ${montoStr} ha sido actualizada.`;
        if (t.status === "APPROVED") {
          msg = `🎉 ¡Tu recarga de ${montoStr} fue aprobada y abonada a tu balance! 💳`;
        } else if (t.status === "REJECTED") {
          msg = `❌ Tu recarga de ${montoStr} fue rechazada por la administración.`;
        }

        unreadNotificationsList.unshift({
          id: `topup_${t.id}`,
          targetView: "topup",
          message: msg,
          created_at: "Hace un momento",
          is_read: false
        });

        if (t.status === "APPROVED" && typeof refreshMe === "function") {
          refreshMe();
        }
      }
      lastKnownDuelsState[topupKey] = t.status;
    });

    // 3. RETIROS PERSONALES (Para el usuario solicitante)
    const myWithdrawals = await API.get("/payments/withdrawals").catch(() => []);
    myWithdrawals.forEach(w => {
      const withdrawKey = `withdraw_status_${w.id}`;
      const prevWithdrawStatus = lastKnownDuelsState[withdrawKey];

      if (prevWithdrawStatus && prevWithdrawStatus !== w.status) {
        newAlertsFound = true;
        const montoStr = w.amount ? `$${Number(w.amount).toFixed(2)}` : "";

        let msg = `Tu solicitud de retiro de ${montoStr} ha sido actualizada.`;
        if (w.status === "PAID") {
          msg = `💸 ¡Tu retiro de ${montoStr} ha sido pagado con éxito!`;
        } else if (w.status === "REJECTED") {
          msg = `❌ Tu retiro de ${montoStr} fue rechazado. El monto ha sido devuelto a tu balance.`;
        }

        unreadNotificationsList.unshift({
          id: `withdraw_${w.id}`,
          targetView: "withdraw",
          message: msg,
          created_at: "Hace un momento",
          is_read: false
        });

        if (typeof refreshMe === "function") {
          refreshMe();
        }
      }
      lastKnownDuelsState[withdrawKey] = w.status;
    });

    // -------------------------------------------------------------
    // 4. RECARGAS Y RETIROS PENDIENTES (Solo Administradores)
    // -------------------------------------------------------------
    const isAdmin = App.user.role === "admin" || App.user.role === "superadmin";
    if (isAdmin) {
      const [pendingTopups, pendingWithdrawals] = await Promise.all([
        API.get("/admin/topups?status=PENDING").catch(() => []),
        API.get("/admin/withdrawals?status=PENDING").catch(() => [])
      ]);
      
      const totalPendingRequests = pendingTopups.length + pendingWithdrawals.length;
      updatePaymentsBadge(totalPendingRequests);

      // Notificaciones de recargas pendientes para admin
      pendingTopups.forEach(p => {
        const notifKey = `pending_topup_${p.id}`;
        if (!lastKnownDuelsState[notifKey]) {
          newAlertsFound = true;
          lastKnownDuelsState[notifKey] = true;

          const montoStr = p.amount ? `$${Number(p.amount).toFixed(2)}` : "";
          const usuarioStr = p.username || p.user_id || "un usuario";

          unreadNotificationsList.unshift({
            id: `admin_topup_${p.id}`,
            targetView: "admin-requests",
            message: `📩 Nueva recarga pendiente de ${montoStr} de @${usuarioStr}. ¡Haz clic para procesar!`,
            created_at: "Hace un momento",
            is_read: false
          });
        }
      });

      // Notificaciones de retiros pendientes para admin
      pendingWithdrawals.forEach(w => {
        const notifKey = `pending_withdraw_${w.id}`;
        if (!lastKnownDuelsState[notifKey]) {
          newAlertsFound = true;
          lastKnownDuelsState[notifKey] = true;

          const montoStr = w.amount ? `$${Number(w.amount).toFixed(2)}` : "";
          const usuarioStr = w.username || w.user_id || "un usuario";

          unreadNotificationsList.unshift({
            id: `admin_withdraw_${w.id}`,
            targetView: "admin-requests",
            message: `💸 Nueva solicitud de retiro de ${montoStr} de @${usuarioStr}. ¡Haz clic para pagar!`,
            created_at: "Hace un momento",
            is_read: false
          });
        }
      });
    }

    // -------------------------------------------------------------
    // 5. RENDERIZADO VISUAL DE LA CAMPANITA
    // -------------------------------------------------------------
    if (newAlertsFound) {
      playNotificationSound("success");
      toast("¡Tienes nuevas actualizaciones en la plataforma!", "info");
    }

    const unread = unreadNotificationsList.filter(n => !n.is_read);
    if (unread.length > 0) {
      badgeEl.textContent = unread.length;
      badgeEl.classList.remove("hidden");
    } else {
      badgeEl.classList.add("hidden");
    }

    if (unreadNotificationsList.length > 0) {
      listEl.innerHTML = unreadNotificationsList.map((n, idx) => `
        <div data-notif-idx="${idx}" data-target-view="${n.targetView || 'dashboard'}" 
             class="p-2.5 cursor-pointer hover:bg-slate-100 transition-colors ${!n.is_read ? 'bg-emerald-50/60 font-semibold' : ''}">
          <p class="text-slate-800 text-xs">${esc(n.message)}</p>
          <span class="text-[10px] text-slate-400 mt-0.5 block">${esc(n.created_at)}</span>
        </div>
      `).join("");

      listEl.querySelectorAll("[data-notif-idx]").forEach(item => {
        item.addEventListener("click", () => {
          const idx = Number(item.dataset.notifIdx);
          const targetView = item.dataset.targetView;

          if (unreadNotificationsList[idx]) {
            unreadNotificationsList[idx].is_read = true;
          }

          document.getElementById("notification-dropdown")?.classList.add("hidden");
          
          if (typeof showView === "function") {
            showView(targetView);
          }
          
          checkNotifications();
        });
      });
    } else {
      listEl.innerHTML = '<div class="p-4 text-center text-slate-400">Sin notificaciones nuevas</div>';
    }
  } catch (_) {}
}

// Función para actualizar el indicador rojo flotante sobre el ícono de "Pagos"
function updatePaymentsBadge(count) {
  const paymentsBtn = document.querySelector('[data-nav-btn="admin-requests"]');
  if (!paymentsBtn) return;

  paymentsBtn.classList.add("relative");

  let badge = document.getElementById("payments-pending-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "payments-pending-badge";
    badge.className = "absolute -top-1 right-2 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center animate-pulse shadow-md";
    paymentsBtn.appendChild(badge);
  }

  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// Función corregida para ubicar el botón del banco en el menú inferior y colocar el badge rojo
function updateBankBadge(count) {
  // Buscamos el botón del banco examinando atributos onclick o clases comunes en tu barra inferior
  const bankBtn = document.querySelector('button[onclick*="banco"]') || 
                  document.querySelector('button[onclick*="bank"]') || 
                  Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Banco'));
  
  if (!bankBtn) return;

  bankBtn.classList.add("relative");

  let badge = document.getElementById("bank-pending-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "bank-pending-badge";
    badge.className = "absolute top-1 right-2 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center animate-pulse shadow-md";
    bankBtn.appendChild(badge);
  }

  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function initNotificationPolling() {
  // Consultar cambios cada 15 segundos
  setInterval(checkNotifications, 15000);
  
  const bellBtn = document.getElementById("notification-bell");
  const dropdown = document.getElementById("notification-dropdown");
  
  if (bellBtn && dropdown) {
    bellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
        dropdown.classList.add("hidden");
      }
    });
  }

  document.getElementById("mark-all-read")?.addEventListener("click", () => {
    unreadNotificationsList.forEach(n => n.is_read = true);
    const badgeEl = document.getElementById("notification-badge");
    if (badgeEl) badgeEl.classList.add("hidden");
    checkNotifications();
    dropdown?.classList.add("hidden");
  });
}
/* ───────────────────── Estado y Mapa de Condiciones ───────────────────── */
let globalDuelTypes = [];
let currentRaceEntries = [];
let globalAvailableDuels = [];
let pendingAcceptDuelId = null;
let _delegationBound = false;

let activeHorseSelections = {
  my: null,
  rival: null,
  my2: null,
  rival2: null
};

const INDIVIDUAL_CONDITIONS = {
  1: { creator: "Ganas si llega 1.º", acceptor: "Ganas si llega en 2° o peor lugar" },
  2: { creator: "Ganas si llega 1.º o 2.º", acceptor: "Ganas si llega 3° o peor" },
  3: { creator: "Ganas si llega 1.º, 2.º o 3.º", acceptor: "Ganas si llega 4° o peor" },
  4: { creator: "Ganas si llega 1.º, 2.º, 3.º o 4.º", acceptor: "Ganas si llega 5.º o peor" },
  5: { creator: "Ganas si entra en la pizarra (top 5)", acceptor: "Ganas si queda fuera de la pizarra (6.º o peor)" }
};

/* ───────────────────────── Utilidades ───────────────────────── */
const $= (sel) => document.querySelector(sel); const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function fmt(value) {
  const n = Number(value || 0);
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function emptyState(message) {
  return `<div class="p-8 text-center text-slate-400 font-medium text-sm">${esc(message)}</div>`;
}

const STATUS_BADGE = {
  OPEN: '<span class="badge badge-open">Abierto</span>',
  ACTIVE: '<span class="badge badge-active">Activo</span>',
  RESOLVED: '<span class="badge badge-resolved">Resuelto</span>',
  PENDING: '<span class="badge badge-pending">Pendiente</span>',
  APPROVED: '<span class="badge badge-approved">Aprobada</span>',
  REJECTED: '<span class="badge badge-rejected">Rechazada</span>',
  PAID: '<span class="badge badge-paid">Pagada</span>',
};
const badge = (status) => STATUS_BADGE[status] || `<span class="badge">${esc(status)}</span>`;

const RULE_LABEL = {
  LOWEST_HORSE_NUMBER: "Gana el menor número",
  HIGHEST_HORSE_NUMBER: "Gana el mayor número",
  MANUAL: "Ganador manual (admin)",
  TIE_REFUND: "Empate ⇒ reembolso",
  OFFICIAL_FINISH: "Según posiciones oficiales (top 5)",
};

/* ───────────────────────── Estado y navegación ───────────────────────── */
const App = { user: null, view: "dashboard" };

const NAV_ITEMS = [
  { id: "dashboard", icon: "🏠", label: "Inicio", admin: false },
  { id: "create-duel", icon: "⚔️", label: "Crear", admin: false },
  { id: "available", icon: "📜", label: "Abiertos", admin: false },
  { id: "my-duels", icon: "🎯", label: "Mis duelos", admin: false },
  { id: "topup", icon: "💳", label: "Recarga", admin: false },
  { id: "withdraw", icon: "💸", label: "Retiro", admin: false },
  { id: "admin-duel-types", icon: "🧩", label: "Tipos", admin: true },
  { id: "admin-races", icon: "📁", label: "Cartelera", admin: true },
  { id: "admin-results", icon: "🏁", label: "Llegada", admin: true },
  { id: "admin-resolve", icon: "✅", label: "Resolver", admin: true },
  { id: "admin-requests", icon: "💰", label: "Pagos", admin: true },
  { id: "admin-bank", icon: "🏦", label: "Banco", admin: true },
  { id: "admin-audit", icon: "📊", label: "Auditoría", admin: true },
];

const VIEW_LOADERS = {
  dashboard: loadDashboard,
  "create-duel": loadCreateDuel,
  available: loadAvailable,
  "my-duels": loadMyDuels,
  topup: loadTopup,
  withdraw: loadWithdraw,
  "admin-duel-types": () => window.Admin && Admin.loadDuelTypes(),
  "admin-races": () => window.Admin && Admin.loadRaces(),
  "admin-results": () => window.Admin && Admin.loadOfficialResults(),
  "admin-resolve": () => window.Admin && Admin.loadResolve(),
  "admin-requests": () => window.Admin && Admin.loadRequests(),
  "admin-bank": () => window.Admin && Admin.loadBank(),
  "admin-audit": () => window.Admin && Admin.loadAudit(),
};

function buildNav() {
  const isAdminOrSuper = App.user && (App.user.role === "admin" || App.user.role === "superadmin");
  const items = NAV_ITEMS.filter((n) => !n.admin || isAdminOrSuper);
  const navContainer = $("#nav-items");
  if (navContainer) {
    navContainer.innerHTML = items.map((n) => `
      <button data-nav="${n.id}" data-nav-btn="${n.id}"
        class="shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-500">
        <span class="text-lg leading-none">${n.icon}</span>${n.label}
      </button>`).join("");
  }
}

function showView(viewId) {
  if (!VIEW_LOADERS[viewId]) return;
  const isPrivileged = App.user && (App.user.role === "admin" || App.user.role === "superadmin");
  if (App.user && !isPrivileged && viewId.startsWith("admin-")) return;
  App.view = viewId;
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${viewId}`));
  $$("[data-nav-btn]").forEach((b) => {
    const on = b.dataset.navBtn === viewId;
    b.classList.toggle("bg-emerald-50", on);
    b.classList.toggle("text-emerald-700", on);
    b.classList.toggle("text-slate-500", !on);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  Promise.resolve(VIEW_LOADERS[viewId]()).catch((e) => toast(e.message, "err"));
}

/* ───────────────────────── Autenticación ───────────────────────── */
function updateBalance(value) {
  if (!App.user) return;
  App.user.balance = value;
  API.setSession(API.token(), App.user);
  const headerBal = $("#header-balance"); if (headerBal) headerBal.textContent = fmt(value);
  const dash = $("#dash-balance"); if (dash) dash.textContent = fmt(value);
  const wd = $("#withdraw-balance"); if (wd) wd.textContent = fmt(value);
}

async function refreshMe(silent = true) {
  try {
    const me = await API.get("/auth/me");
    App.user = me;
    API.setSession(API.token(), me);
    const userEl = $("#header-user");
    if (userEl) {
      const roleText = me.role === "superadmin" ? "Superadmin" : me.role === "admin" ? "Administrador" : "Usuario";
      userEl.textContent = `${me.username} · ${roleText}`;
    }
    updateBalance(me.balance);
    return me;
  } catch (e) {
    if (!silent) throw e;
    return null;
  }
}

function showAuth() {
  $("#auth-screen")?.classList.remove("hidden");
  $("#app")?.classList.add("hidden");
}

async function enterApp(user) {
  App.user = user;
  $("#auth-screen")?.classList.add("hidden");
  $("#app")?.classList.remove("hidden");
  const userEl = $("#header-user");
  if (userEl) {
    const roleText = user.role === "superadmin" ? "Superadmin" : user.role === "admin" ? "Administrador" : "Usuario";
    userEl.textContent = `${user.username} · ${roleText}`;
  }
  updateBalance(user.balance);
  buildNav();
  showView("dashboard");

  // 🔔 Iniciar la campanita y verificar notificaciones
  initNotificationPolling();
  checkNotifications();
}

function endSession(message) {
  API.clearSession();
  App.user = null;
  showAuth();
  if (message) toast(message, "info");
}

function bindAuth() {
  $("#tab-login")?.addEventListener("click", () => {
    $("#login-form")?.classList.remove("hidden");
    $("#register-form")?.classList.add("hidden");
    $("#tab-login")?.classList.add("bg-white", "shadow");
    $("#tab-login")?.classList.remove("text-slate-500");
    $("#tab-register")?.classList.remove("bg-white", "shadow");
    $("#tab-register")?.classList.add("text-slate-500");
  });

  $("#tab-register")?.addEventListener("click", () => {
    $("#register-form")?.classList.remove("hidden");
    $("#login-form")?.classList.add("hidden");
    $("#tab-register")?.classList.add("bg-white", "shadow");
    $("#tab-register")?.classList.remove("text-slate-500");
    $("#tab-login")?.classList.remove("bg-white", "shadow");
    $("#tab-login")?.classList.add("text-slate-500");
  });

  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await API.post("/auth/login", {
        username: $("#login-username").value.trim(),
        password: $("#login-password").value,
      });
      API.setSession(data.token, data.user);
      toast(`Bienvenido, ${data.user.username}`);
      await enterApp(data.user);
    } catch (err) { toast(err.message, "err"); }
  });

  $("#register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await API.post("/auth/register", {
        username: $("#reg-username").value.trim(),
        password: $("#reg-password").value,
      });
      API.setSession(data.token, data.user);
      toast("Cuenta creada con balance $0.00. ¡Recarga para jugar!");
      await enterApp(data.user);
    } catch (err) { toast(err.message, "err"); }
  });

  $("#logout-btn")?.addEventListener("click", async () => {
    await API.logout();
    endSession("Sesión cerrada.");
  });

  window.addEventListener("auth:expired", () => endSession("Tu sesión expiró. Entra de nuevo."));
}

/* ───────────────────── Plantillas compartidas de tarjetas ───────────────────── */
function duelCard(duel, actionsHtml = "") {
  const youCreator = App.user && duel.creator_id === App.user.id;
  const isResolved = duel.status === "RESOLVED";

  let personalOutcome = null; 
  if (isResolved) {
    if (!duel.winner_id || duel.winner_username === null || (duel.payout_amount === 0 && duel.pot === 0) || (duel.resolution_note && duel.resolution_note.includes("Reembolso"))) {
      personalOutcome = "TIE";
    } else if (App.user && duel.winner_id === App.user.id) {
      personalOutcome = "WIN";
    } else {
      personalOutcome = "LOSS";
    }
  }

  let cardBorderClass = "border-slate-200/80 bg-white";
  let statusBadgeHtml = badge(duel.status);

  if (isResolved) {
    if (personalOutcome === "WIN") {
      cardBorderClass = "border-emerald-300 bg-emerald-50/30 shadow-sm";
      statusBadgeHtml = '<span class="badge bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">🏆 ¡GANASTE!</span>';
    } else if (personalOutcome === "LOSS") {
      cardBorderClass = "border-rose-200 bg-rose-50/20";
      statusBadgeHtml = '<span class="badge bg-rose-100 text-rose-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">❌ PERDISTE</span>';
    } else if (personalOutcome === "TIE") {
      cardBorderClass = "border-amber-200 bg-amber-50/20";
      statusBadgeHtml = '<span class="badge bg-amber-100 text-amber-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">🤝 REEMBOLSADO</span>';
    }
  }
  
  const isMorocha = Boolean(duel.horse_creator_2 || duel.horse_opponent_2);
  const isMatchup = !isMorocha && duel.horse_creator !== duel.horse_opponent;

  let matchupHtml = "";

  if (isMorocha) {
    const sideCreator = `
      <div>N.º ${duel.horse_creator} · ${esc(duel.horse_creator_name)}</div>
      <div>N.º ${duel.horse_creator_2} · ${esc(duel.horse_creator_2_name)}</div>
    `;
    const sideOpponent = `
      <div>N.º ${duel.horse_opponent} · ${esc(duel.horse_opponent_name)}</div>
      <div>N.º ${duel.horse_opponent_2} · ${esc(duel.horse_opponent_2_name)}</div>
    `;

    matchupHtml = `
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 my-3 text-center">
        <div class="rounded-xl bg-slate-50 border border-slate-200 py-2 px-1">
          <p class="text-[10px] uppercase text-slate-400 font-bold">${youCreator ? "Mis Caballos" : "Rival (Creador)"}</p>
          <div class="text-xs font-bold leading-tight text-slate-800 space-y-1 mt-1">${sideCreator}</div>
        </div>
        <span class="font-black text-slate-300">VS</span>
        <div class="rounded-xl bg-emerald-50/70 border border-emerald-200 py-2 px-1">
          <p class="text-[10px] uppercase text-emerald-700 font-bold">${youCreator ? "Caballos Rivales" : "TUS CABALLOS (Si aceptas)"}</p>
          <div class="text-xs font-bold leading-tight text-emerald-950 space-y-1 mt-1">${sideOpponent}</div>
        </div>
      </div>
    `;
  } else if (isMatchup) {
    matchupHtml = `
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 my-3 text-center">
        <div class="rounded-xl bg-slate-50 border border-slate-200 py-2 px-1">
          <p class="text-[10px] uppercase text-slate-400 font-bold">${youCreator ? "Tu Caballo" : "Rival (Creador)"}</p>
          <p class="text-xs font-bold leading-tight text-slate-800 mt-0.5">N.º ${duel.horse_creator} · ${esc(duel.horse_creator_name)}</p>
        </div>
        <span class="font-black text-slate-300">VS</span>
        <div class="rounded-xl bg-emerald-50/70 border border-emerald-200 py-2 px-1">
          <p class="text-[10px] uppercase text-emerald-700 font-bold">${youCreator ? "Caballo Rival" : "TU CABALLO (Si aceptas)"}</p>
          <p class="text-xs font-bold leading-tight text-emerald-950 mt-0.5">N.º ${duel.horse_opponent} · ${esc(duel.horse_opponent_name)}</p>
        </div>
      </div>
    `;
  } else {
    const condConfig = INDIVIDUAL_CONDITIONS[duel.duel_type_id] || {
      creator: "Apuestas A FAVOR de la condición oficial",
      acceptor: "Apuestas EN CONTRA de la condición oficial"
    };

    const conditionText = youCreator ? condConfig.creator : condConfig.acceptor;
    const badgeText = youCreator ? "TU APUESTA (A FAVOR)" : "TU CONDICIÓN DE VICTORIA (SI ACEPTAS)";
    const bgClass = youCreator 
      ? "bg-amber-50/70 border-amber-200 text-amber-900" 
      : "bg-emerald-50/70 border-emerald-200 text-emerald-900";

    matchupHtml = `
      <div class="my-3 text-center">
        <div class="rounded-xl border py-2.5 px-3 ${bgClass}">
          <p class="text-[10px] uppercase font-bold tracking-wider opacity-80">${badgeText}</p>
          <p class="text-sm font-black mt-0.5">N.º ${duel.horse_creator} — ${esc(duel.horse_creator_name)}</p>
          <p class="text-xs font-semibold mt-1 opacity-90">🎯 ${conditionText}</p>
        </div>
      </div>
    `;
  }

  const winnerText = duel.winner_username
    ? `<p class="text-xs font-bold ${personalOutcome === 'WIN' ? 'text-emerald-700' : personalOutcome === 'LOSS' ? 'text-rose-700' : 'text-slate-700'} mt-1">🏆 Ganador: ${esc(duel.winner_username)} (caballo N.º ${duel.winner_horse_number}) · ${fmt(duel.payout_amount)}</p>`
    : `<p class="text-xs font-bold text-amber-700 mt-1">🤝 Duelo empatado / Reembolsado sin comisión</p>`;

  const winnerHtml = isResolved ? winnerText : "";

  return `
  <article class="card ${cardBorderClass}">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="font-bold text-slate-900 text-sm">${esc(duel.duel_type_name)}</p>
        <p class="text-[11px] text-slate-500">Carrera ${duel.race_number} · ${esc(duel.race_datetime || "—")} · ${esc(RULE_LABEL[duel.logic_rule] || duel.logic_rule || "")}</p>
      </div>
      ${statusBadgeHtml}
    </div>

    ${matchupHtml}

    <div class="flex items-center justify-between text-xs text-slate-600 mb-2">
      <span>👤 Creado por <b>${esc(duel.creator_username)}</b>${duel.acceptor_username ? ` vs <b>${esc(duel.acceptor_username)}</b>` : ""}</span>
      <span>Stake <b class="money">${fmt(duel.stake)}</b> · Pozo <b class="money">${fmt(duel.pot)}</b></span>
    </div>
    ${winnerHtml}
    ${actionsHtml ? `<div class="mt-3">${actionsHtml}</div>` : ""}
  </article>`;
}

/* ───────────────────────── Vistas de usuario ───────────────────────── */
async function loadDashboard() {
  await refreshMe();
  const duels = await API.get("/duels/mine");
  const recent = duels.slice(0, 3);
  const dashEl = $("#dash-duels");
  if (dashEl) {
    dashEl.innerHTML = recent.length
      ? recent.map((d) => duelCard(d)).join("")
      : emptyState("Aún no tienes duelos. ¡Crea el primero! ⚔️");
  }
}

async function loadCreateDuel() {
  const [types, races] = await Promise.all([
    API.get("/duel-types"),
    API.get("/races"),
  ]);

  globalDuelTypes = types;

    const typeContainer = $("#duel-type-select-container") || $("#duel-type-select")?.parentElement;
  if (typeContainer && types.length) {
    typeContainer.innerHTML = `
      <input type="hidden" id="duel-type-select" value="${types[0].id}" />
      <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar" id="duel-type-pills">
        ${types.map((t, idx) => `
          <button type="button" data-type-id="${t.id}"
                  class="type-pill shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all select-none
                         ${idx === 0 ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}">
            ${esc(t.name)}
          </button>
        `).join("")}
      </div>
    `;

    typeContainer.querySelectorAll(".type-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const typeId = Number(btn.dataset.typeId);
        $("#duel-type-select").value = typeId;

        typeContainer.querySelectorAll(".type-pill").forEach((b) => {
          const isSelected = Number(b.dataset.typeId) === typeId;
          b.classList.toggle("bg-emerald-600", isSelected);
          b.classList.toggle("text-white", isSelected);
          b.classList.toggle("border-emerald-600", isSelected);
          b.classList.toggle("shadow-sm", isSelected);
          b.classList.toggle("bg-white", !isSelected);
          b.classList.toggle("text-slate-700", !isSelected);
          b.classList.toggle("border-slate-200", !isSelected);
        });

        updateDuelTypeDescription();
        renderHorseSelects();
      });
    });
  }

  if (!races || races.length === 0) {
    currentRaceEntries = [];
    renderHorseSelects();
    return;
  }

  const racesByNumber = {};
  races.forEach((r) => {
    if (!racesByNumber[r.race_number]) racesByNumber[r.race_number] = [];
    racesByNumber[r.race_number].push(r);
  });

  const now = new Date();
  // Listamos todas las carreras agrupadas, priorizando las que no estén cerradas manualmente
  const openRaceNumbers = Object.keys(racesByNumber)
    .filter((rNum) => {
      const rows = racesByNumber[rNum];
      const isClosedManually = rows.some((h) => h.is_closed === true);
      return !isClosedManually; // Muestra todas las carreras de la cartelera cargada que estén abiertas
    })
    .sort((a, b) => Number(a) - Number(b));

  const raceContainer = $("#race-select-container") || $("#race-select")?.parentElement;

  if (openRaceNumbers.length === 0) {
    if (raceContainer) {
      raceContainer.innerHTML = `
        <input type="hidden" id="race-select" value="" />
        <div class="p-3 text-xs font-semibold text-slate-500 bg-slate-50 rounded-xl border border-slate-200 text-center">
          No hay carreras disponibles en este momento
        </div>`;
    }
    currentRaceEntries = [];
    renderHorseSelects();
    return;
  }

  if (raceContainer) {
    raceContainer.innerHTML = `
      <input type="hidden" id="race-select" value="${openRaceNumbers[0]}" />
      <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar" id="race-pills">
        ${openRaceNumbers.map((rNum, idx) => {
          const first = racesByNumber[rNum][0];
          const timeStr = first.race_datetime ? first.race_datetime.split(" ")[1] || first.race_datetime : "";
          return `
            <button type="button" data-race-num="${rNum}"
                    class="race-pill shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all select-none
                           ${idx === 0 ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}">
              Carrera ${rNum}${timeStr ? '· ' + esc(timeStr) : ''}
            </button>
          `;
        }).join("")}
      </div>
    `;

    raceContainer.querySelectorAll(".race-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rNum = btn.dataset.raceNum;
        $("#race-select").value = rNum;

        raceContainer.querySelectorAll(".race-pill").forEach((b) => {
          const isSelected = b.dataset.raceNum === rNum;
          b.classList.toggle("bg-slate-900", isSelected);
          b.classList.toggle("text-white", isSelected);
          b.classList.toggle("border-slate-900", isSelected);
          b.classList.toggle("shadow-sm", isSelected);
          b.classList.toggle("bg-white", !isSelected);
          b.classList.toggle("text-slate-700", !isSelected);
          b.classList.toggle("border-slate-200", !isSelected);
        });

        currentRaceEntries = racesByNumber[rNum] || [];
        renderHorseSelects();
      });
    });
  }

  currentRaceEntries = racesByNumber[openRaceNumbers[0]] || [];
  updateDuelTypeDescription();
  renderHorseSelects();
}

function updateDuelTypeDescription() {
  const typeSel = $("#duel-type-select");
  if (!typeSel) return;
  const typeId = Number(typeSel.value);
  const type = globalDuelTypes.find((t) => t.id === typeId);
  const descEl = $("#duel-type-hint");
  if (descEl && type) {
    descEl.textContent = `${type.description || "Sin descripción"} (${RULE_LABEL[type.logic_rule] || type.logic_rule})`;
  }
}

function renderHorseSelects() {
  let container = $("#horses-select-container");
  if (!container) {
    const firstSelect = $("#horse-my-select");
    if (firstSelect) container = firstSelect.closest(".grid") || firstSelect.parentElement;
  }
  if (!container) return;

  const typeVal = $("#duel-type-select")?.value;
  if (!typeVal) return;
  const typeId = Number(typeVal);
  const selectedType = globalDuelTypes.find((t) => t.id === typeId);
  if (!selectedType) return;

  activeHorseSelections = { my: null, rival: null, my2: null, rival2: null };

  const horsesHtml = currentRaceEntries.map((e) => {
    let rawName = String(e.horse_name || "");
    // Cortar cualquier etiqueta de precio de forma limpia
    rawName = rawName.split(/Precio/i)[0].split(/\$/)[0];
    rawName = rawName.replace(/^(N[º°.]\s*\d+|[-–—]+)\s*/i, "").trim();
    rawName = rawName.replace(/[-–—:$]+$/, "").trim();

    return {
      number: e.horse_number,
      name: rawName || `Ejemplar ${e.horse_number}`
    };
  });

  function buildHorseGrid(slotKey, labelTitle) {
    const cards = horsesHtml.map((h) => `
      <div data-slot="${slotKey}" data-horse="${h.number}" 
           class="horse-card cursor-pointer border border-slate-200/80 rounded-xl p-2 text-center bg-white hover:border-emerald-500 hover:shadow-sm transition-all select-none relative overflow-hidden group flex flex-col items-center justify-between min-h-[85px]">
        
        <div class="flex items-center justify-between w-full px-0.5">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-slate-800 font-black text-[11px] shadow-sm group-hover:bg-emerald-100 group-hover:text-emerald-800 transition-colors">
            ${h.number}
          </span>
          <div class="w-3"></div>
        </div>

        <div class="relative flex items-center justify-center my-0.5">
          <svg class="w-16 h-8 text-slate-300 group-hover:text-emerald-500 transition-colors" fill="currentColor" viewBox="0 0 100 70">
            <path d="M 32 12 A 5 5 0 1 1 37 7 A 5 5 0 0 1 32 12 Z M 28 8 L 38 7 L 35 12 Z"/>
            <path d="M 28 13 Q 35 10 42 16 L 36 28 Q 28 26 24 20 Z" />
            <path d="M 40 18 L 52 24 L 40 21 Z" />
            <path d="M 68 18 Q 60 20 54 28 Q 42 26 28 28 Q 18 28 12 36 Q 22 46 38 46 Q 52 46 62 38 Q 66 32 74 24 Q 72 18 68 18 Z" />
            <path d="M 12 36 C 6 38 2 44 0 52 C 5 48 10 44 14 40 Z" />
            <path d="M 60 36 L 76 48 L 74 51 L 56 39 Z" />
            <path d="M 54 38 L 68 56 L 64 58 L 50 42 Z" />
            <path d="M 24 44 L 16 60 L 12 59 L 20 42 Z" />
            <path d="M 30 44 L 26 62 L 22 61 L 26 42 Z" />
          </svg>
        </div>

        <p class="text-[10px] font-bold text-slate-700 truncate w-full mt-0.5">${esc(h.name)}</p>
      </div>
    `).join("");

    return `
      <div class="col-span-full mb-3">
        <label class="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">${labelTitle}</label>
        <input type="hidden" id="${getSlotInputId(slotKey)}" value="" required />
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 p-1.5 bg-slate-50/50 rounded-2xl border border-slate-100" id="grid-${slotKey}">
          ${cards}
        </div>
      </div>
    `;
  }

  if (selectedType.is_morocha) {
    container.className = "space-y-3";
    container.innerHTML = `
      ${buildHorseGrid("my", "Tus Caballos (Ejemplar 1)")}
      ${buildHorseGrid("my2", "Tus Caballos (Ejemplar 2)")}
      ${buildHorseGrid("rival", "Caballos Rivales (Ejemplar 1)")}
      ${buildHorseGrid("rival2", "Caballos Rivales (Ejemplar 2)")}
    `;
  } else if (selectedType.is_matchup) {
    container.className = "space-y-3";
    container.innerHTML = `
      ${buildHorseGrid("my", "Tu Caballo")}
      ${buildHorseGrid("rival", "Caballo Rival")}
    `;
  } else {
    container.className = "space-y-3";
    container.innerHTML = buildHorseGrid("my", "Tu Caballo");
  }

  container.querySelectorAll(".horse-card").forEach((card) => {
    card.addEventListener("click", () => {
      const slot = card.dataset.slot;
      const horseNum = Number(card.dataset.horse);
      
      activeHorseSelections[slot] = horseNum;
      
      const hiddenInput = document.getElementById(getSlotInputId(slot));
      if (hiddenInput) hiddenInput.value = horseNum;

      const grid = document.getElementById(`grid-${slot}`);
      grid.querySelectorAll(".horse-card").forEach((c) => {
        const isSelected = Number(c.dataset.horse) === horseNum;
        c.classList.toggle("border-emerald-600", isSelected);
        c.classList.toggle("bg-emerald-50", isSelected);
        c.classList.toggle("shadow-md", isSelected);
      });

      updateHorseCardDisabling();
    });
  });
}

function getSlotInputId(slotKey) {
  switch(slotKey) {
    case "my": return "horse-my-select";
    case "rival": return "horse-rival-select";
    case "my2": return "horse-my-2-select";
    case "rival2": return "horse-rival-2-select";
    default: return "horse-my-select";
  }
}

function updateHorseCardDisabling() {
  const selectedValues = Object.values(activeHorseSelections).filter(val => val !== null);

  document.querySelectorAll(".horse-card").forEach((card) => {
    const horseNum = Number(card.dataset.horse);
    const slot = card.dataset.slot;
    const isCurrentSlotSelection = activeHorseSelections[slot] === horseNum;
    const isTakenElsewhere = selectedValues.includes(horseNum) && !isCurrentSlotSelection;

    card.classList.toggle("opacity-40", isTakenElsewhere);
    card.classList.toggle("pointer-events-none", isTakenElsewhere);
  });
}

async function loadAvailable() {
  const duels = await API.get("/duels/available");
  globalAvailableDuels = duels;

  const availEl = $("#available-list");
  if (availEl) {
    availEl.innerHTML = duels.length
      ? duels.map((d) => duelCard(d, `
          <button class="btn btn-primary w-full py-2.5 rounded-xl font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700" data-action="accept-duel" data-id="${d.id}">
            ⚡ Aceptar y retener ${fmt(d.stake)}
          </button>`)).join("")
      : emptyState("No hay duelos abiertos ahora mismo. 🏇");
  }
}

async function loadMyDuels() {
  const duels = await API.get("/duels/mine");
  const myDuelsEl = $("#my-duels-list");
  if (myDuelsEl) {
    myDuelsEl.innerHTML = duels.length
      ? duels.map((d) => {
          const canCancel = d.status === "OPEN" && d.creator_id === App.user.id;
          const actions = canCancel
            ? `<button class="btn btn-danger w-full py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700" data-action="cancel-duel" data-id="${d.id}">✕ Cancelar duelo (reembolsar)</button>`
            : "";
          return duelCard(d, actions);
        }).join("")
      : emptyState("Todavía no participas en ningún duelo.");
  }
}

async function loadTopup() {
  const [bank, history] = await Promise.all([
    API.get("/bank").catch(() => null),
    API.get("/payments/topups"),
  ]);
  const bankEl = $("#bank-info-topup");
  if (bankEl) {
    bankEl.innerHTML = bank && bank.bank_name
      ? `
        <p class="font-bold text-slate-800">🏦 ${esc(bank.bank_name)} — ${esc(bank.account_type)}</p>
        <p><b>Teléfono:</b> ${esc(bank.phone)}</p>
        <p><b>Cédula:</b> ${esc(bank.id_number)}</p>
        <p><b>Titular:</b> ${esc(bank.holder_name)}</p>`
      : '<p class="text-xs text-amber-600 font-bold">⚠ Aún no hay datos bancarios configurados por el administrador.</p>';
  }

  const topupHistEl = $("#topup-history");
  if (topupHistEl) {
    topupHistEl.innerHTML = history.length
      ? history.map((r) => `
        <div class="card card-tight flex items-center justify-between gap-2">
          <div class="text-xs">
            <p class="font-bold text-slate-800 money">${fmt(r.amount)} · Ref ${esc(r.reference)}</p>
            <p class="text-slate-500">${esc(r.created_at || "")} · desde ${esc(r.wallet_phone)}</p>
          </div>
          ${badge(r.status)}
        </div>`).join("")
      : emptyState("No has reportado recargas.");
  }
}

async function loadWithdraw() {
  await refreshMe();
  const history = await API.get("/payments/withdrawals");
  const wdHistEl = $("#withdraw-history");
  if (wdHistEl) {
    wdHistEl.innerHTML = history.length
      ? history.map((r) => `
        <div class="card card-tight flex items-center justify-between gap-2">
          <div class="text-xs">
            <p class="font-bold text-slate-800 money">${fmt(r.amount)} → ${esc(r.destination_phone)}</p>
            <p class="text-slate-500">${esc(r.created_at || "")}</p>
          </div>
          ${badge(r.status)}
        </div>`).join("")
      : emptyState("No has solicitado retiros.");
  }
}

function openAcceptModal(duel) {
  pendingAcceptDuelId = duel.id;
  const modal = document.getElementById("confirm-modal");
  const content = document.getElementById("modal-summary-content");
  if (!modal || !content) return;

  const userBalance = App.user ? App.user.balance : 0;
  const hasEnoughBalance = userBalance >= duel.stake;

  let conditionDetail = "";

  if (duel.horse_creator_2 || duel.horse_opponent_2) {
    conditionDetail = `
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
        <p class="font-bold text-emerald-800 uppercase text-[10px] tracking-wider">TUS CABALLOS (SI ACEPTAS)</p>
        <p class="font-bold text-emerald-950 text-sm">N.º ${duel.horse_opponent} (${esc(duel.horse_opponent_name)}) y N.º ${duel.horse_opponent_2} (${esc(duel.horse_opponent_2_name)})</p>
        <p class="text-emerald-700 text-xs font-medium">🎯 Ganas si cualquiera de tus 2 caballos llega antes que los del rival.</p>
      </div>`;
  } else if (duel.horse_creator !== duel.horse_opponent) {
    conditionDetail = `
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
        <p class="font-bold text-emerald-800 uppercase text-[10px] tracking-wider">TU CABALLO vs RIVAL (SI ACEPTAS)</p>
        <p class="font-bold text-emerald-950 text-sm">N.º ${duel.horse_opponent} (${esc(duel.horse_opponent_name)}) vs N.º ${duel.horse_creator} (${esc(duel.horse_creator_name)})</p>
        <p class="text-emerald-700 text-xs font-semibold mt-1">🎯 Ganas si el N.º ${duel.horse_opponent} (${esc(duel.horse_opponent_name)}) llega antes que el N.º ${duel.horse_creator}.</p>
      </div>`;
  } else {
    const condConfig = INDIVIDUAL_CONDITIONS[duel.duel_type_id] || { acceptor: "Ganas si Tu Caballo cumple la condición opuesta" };
    conditionDetail = `
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
        <p class="font-bold text-emerald-800 uppercase text-[10px] tracking-wider">TU CONDICIÓN DE VICTORIA (SI ACEPTAS)</p>
        <p class="font-bold text-emerald-950 text-sm">N.º ${duel.horse_creator} — ${esc(duel.horse_creator_name)}</p>
        <p class="text-emerald-700 text-xs font-semibold mt-1">🎯 ${condConfig.acceptor}</p>
      </div>`;
  }

  const netPayout = duel.stake * 2 * 0.95;

  content.innerHTML = `
    <div class="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
      <div>
        <p class="font-bold text-slate-800 text-sm">${esc(duel.duel_type_name || "Duelo")}</p>
        <p class="text-slate-500 text-xs">Carrera N.º ${duel.race_number} · Creado por <b>${esc(duel.creator_username || "Usuario")}</b></p>
      </div>
      <span class="font-black text-slate-800 text-sm">${fmt(duel.stake)}</span>
    </div>

    ${conditionDetail}

    <div class="space-y-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
      <div class="flex justify-between text-slate-600">
        <span>Tu Saldo Actual:</span>
        <span class="font-semibold text-slate-800">${fmt(userBalance)}</span>
      </div>
      <div class="flex justify-between text-slate-600">
        <span>Stake a Retener (Escrow):</span>
        <span class="font-semibold text-amber-700">-${fmt(duel.stake)}</span>
      </div>
      <div class="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-200">
        <span>Pozo Estimado (Si ganas):</span>
        <span class="text-emerald-700">${fmt(netPayout)} (Neto)</span>
      </div>
    </div>

    ${
      !hasEnoughBalance
        ? `<div class="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-medium text-center space-y-2 text-xs">
            <p>⚠️ Saldo insuficiente para aceptar este duelo.</p>
            <button type="button" data-nav="topup" class="btn bg-rose-600 text-white hover:bg-rose-700 py-1 px-3 text-xs w-full rounded-lg font-bold">
              Recargar Saldo
            </button>
           </div>`
        : ""
    }
  `;

  const confirmBtn = document.getElementById("confirm-accept-btn");
  if (confirmBtn) {
    confirmBtn.disabled = !hasEnoughBalance;
    confirmBtn.classList.toggle("opacity-50", !hasEnoughBalance);
  }

  modal.classList.remove("hidden");
}

function closeAcceptModal() {
  const modal = document.getElementById("confirm-modal");
  if (modal) modal.classList.add("hidden");
  pendingAcceptDuelId = null;
}

function bindDelegation() {
  if (_delegationBound) return;
  _delegationBound = true;

  document.getElementById("close-modal-btn")?.addEventListener("click", closeAcceptModal);
  document.getElementById("cancel-modal-btn")?.addEventListener("click", closeAcceptModal);

  document.getElementById("confirm-accept-btn")?.addEventListener("click", async () => {
    if (!pendingAcceptDuelId) return;
    const btn = document.getElementById("confirm-accept-btn");
    btn.disabled = true;

    try {
      const duel = await API.post(`/duels/${pendingAcceptDuelId}/accept`, {});
      toast(`¡Duelo #${duel.id} aceptado! Retuviste ${fmt(duel.stake)} en escrow.`);
      closeAcceptModal();
      await refreshMe();
      await loadAvailable();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener("click", async (event) => {
    const navEl = event.target.closest("[data-nav]");
    if (navEl) {
      closeAcceptModal();
      showView(navEl.dataset.nav);
      return;
    }

    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id);

    if (action === "accept-duel") {
      const duel = globalAvailableDuels.find((d) => d.id === id);
      if (duel) {
        openAcceptModal(duel);
      } else {
        toast("No se pudo obtener la información del duelo", "err");
      }
    } else if (action === "cancel-duel") {
      if (!confirm("¿Cancelar este duelo y recuperar tu stake en escrow?")) return;
      actionEl.disabled = true;
      try {
        await API.post(`/duels/${id}/cancel`);
        toast("Duelo cancelado; stake reembolsado.");
        await refreshMe();
        await loadMyDuels();
      } catch (err) {
        toast(err.message, "err");
      } finally {
        actionEl.disabled = false;
      }
    }
  });
}

function updatePayoutCalculator() {
  const stakeInput = document.getElementById("stake-input");
  const calcContainer = document.getElementById("payout-calculator");
  const potEl = document.getElementById("calc-pot");
  const feeEl = document.getElementById("calc-fee");
  const netEl = document.getElementById("calc-net");

  if (!stakeInput || !calcContainer) return;

  const stake = parseFloat(stakeInput.value);

  if (isNaN(stake) || stake <= 0) {
    calcContainer.classList.add("hidden");
    return;
  }

  const pot = stake * 2;
  const fee = pot * 0.05;
  const netPayout = pot - fee;

  if (potEl) potEl.textContent = fmt(pot);
  if (feeEl) feeEl.textContent = `-${fmt(fee)}`;
  if (netEl) netEl.textContent = fmt(netPayout);

  calcContainer.classList.remove("hidden");
}

function bindForms() {
  const stakeInput = $("#stake-input");
  if (stakeInput) {
    stakeInput.addEventListener("input", updatePayoutCalculator);
  }

  $("#create-duel-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const duelTypeId = Number($("#duel-type-select").value);
    const raceNumber = Number($("#race-select").value);
    const stake = Number($("#stake-input").value);

    const selectedType = globalDuelTypes.find((t) => t.id === duelTypeId);
    if (!selectedType) {
      toast("Selecciona un tipo de duelo válido.", "err");
      return;
    }

    const elMy = $("#horse-my-select");
    const elRival = $("#horse-rival-select");
    const elMy2 = $("#horse-my-2-select");
    const elRival2 = $("#horse-rival-2-select");

    const horseCreator = elMy && elMy.value ? Number(elMy.value) : null;
    const horseOpponent = elRival && elRival.value ? Number(elRival.value) : null;
    const horseCreator2 = elMy2 && elMy2.value ? Number(elMy2.value) : null;
    const horseOpponent2 = elRival2 && elRival2.value ? Number(elRival2.value) : null;

    if (selectedType.is_morocha) {
      if (!raceNumber || !horseCreator || !horseOpponent || !horseCreator2 || !horseOpponent2) {
        toast("Debes seleccionar los 4 caballos para la modalidad MOROCHA.", "err");
        return;
      }
      const selectedSet = new Set([horseCreator, horseOpponent, horseCreator2, horseOpponent2]);
      if (selectedSet.size < 4) {
        toast("Los 4 caballos seleccionados para MOROCHA deben ser distintos entre sí.", "err");
        return;
      }
    } else if (selectedType.is_matchup) {
      if (!raceNumber || !horseCreator || !horseOpponent) {
        toast("Debes seleccionar Tu Caballo y el Caballo Rival.", "err");
        return;
      }
      if (horseCreator === horseOpponent) {
        toast("Elige dos caballos distintos.", "err");
        return;
      }
    } else {
      if (!raceNumber || !horseCreator) {
        toast("Debes seleccionar Tu Caballo.", "err");
        return;
      }
    }

    if (!stake || stake <= 0) {
      toast("Ingresa un monto de apuesta (stake) válido.", "err");
      return;
    }

    try {
      const payload = {
        duel_type_id: duelTypeId,
        race_number: raceNumber,
        horse_creator: horseCreator,
        horse_opponent: (selectedType.is_matchup || selectedType.is_morocha) ? horseOpponent : horseCreator,
        stake,
      };

      if (selectedType.is_morocha) {
        payload.horse_creator_2 = horseCreator2;
        payload.horse_opponent_2 = horseOpponent2;
      }

      const duel = await API.post("/duels/create", payload);
      $("#stake-input").value = "";
      
      const calcContainer = document.getElementById("payout-calculator");
      if (calcContainer) calcContainer.classList.add("hidden");

      toast(`¡Duelo #${duel.id} publicado! Stake de ${fmt(duel.stake)} en escrow.`);
      await refreshMe();
      showView("my-duels");
    } catch (err) {
      toast(err.message, "err");
    }
  });

  $("#topup-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await API.post("/payments/topup", {
        amount: Number($("#topup-amount").value),
        reference: $("#topup-reference").value.trim(),
        wallet_phone: $("#topup-phone").value.trim(),
      });
      e.target.reset();
      toast(`Reporte #${r.id} enviado. Espera aprobación de la casa.`);
      await loadTopup();
    } catch (err) {
      toast(err.message, "err");
    }
  });

  $("#withdraw-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await API.post("/payments/withdraw", {
        amount: Number($("#withdraw-amount").value),
        destination_phone: $("#withdraw-phone").value.trim(),
      });
      e.target.reset();
      toast(`Retiro #${r.id} solicitado: ${fmt(r.amount)} retenidos.`);
      await loadWithdraw();
    } catch (err) {
      toast(err.message, "err");
    }
  });

  $("#refresh-available")?.addEventListener("click", () => loadAvailable().catch((e) => toast(e.message, "err")));
  $("#refresh-my-duels")?.addEventListener("click", () => loadMyDuels().catch((e) => toast(e.message, "err")));
}

async function init() {
  bindAuth();
  bindForms();
  bindDelegation();
  if (window.Admin) Admin.bind();

  const tkn = API.token();
  if (tkn) {
    try {
      const me = await API.get("/auth/me");
      API.setSession(tkn, me);
      await enterApp(me);
      return;
    } catch (_) { API.clearSession(); }
  }
  showAuth();
}

document.addEventListener("DOMContentLoaded", init);