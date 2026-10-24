/* Banca Hípica P2P — módulo de administración (CRUD, carga, resolución y auditoría). */
"use strict";

const Admin = (() => {
  let duelTypesCache = [];
  const filters = { topups: "PENDING", withdrawals: "PENDING" };

  const guard = () => App.user && (App.user.role === "admin" || App.user.role === "superadmin");
  const isSuperadmin = () => App.user && App.user.role === "superadmin";
  const q = (sel) => document.querySelector(sel);

  function kpi(label, value, sub = "") {
    return `
      <div class="card card-tight">
        <p class="text-[10px] uppercase tracking-wide text-slate-400">${label}</p>
        <p class="text-lg font-extrabold text-slate-900 money leading-tight">${value}</p>
        ${sub ? `<p class="text-[11px] text-slate-500">${sub}</p>` : ""}
      </div>`;
  }

  /* ══════════════ 1. Tipos de duelo (CRUD) ══════════════ */
  async function loadDuelTypes() {
    duelTypesCache = await API.get("/duel-types");
    q("#duel-types-admin-list").innerHTML = duelTypesCache.length
      ? duelTypesCache.map((t) => `
        <div class="card card-tight">
          <div class="flex justify-between items-start gap-2">
            <div class="min-w-0">
              <p class="font-bold text-sm text-slate-900">${esc(t.name)}</p>
              <p class="text-[11px] text-slate-500">${esc(t.description || "Sin descripción")}</p>
              <p class="text-[11px] font-bold text-emerald-700 mt-1">⚙ ${esc(RULE_LABEL[t.logic_rule] || t.logic_rule)}</p>
            </div>
            <div class="flex gap-1 shrink-0">
              <button class="btn btn-ghost btn-sm" title="Modificar" data-action="edit-duel-type" data-id="${t.id}">✏️</button>
              <button class="btn btn-danger btn-sm" title="Eliminar" data-action="delete-duel-type" data-id="${t.id}">🗑</button>
            </div>
          </div>
        </div>`).join("")
      : emptyState("No hay tipos de duelo. Crea el primero con el formulario.");
  }

  function resetDuelTypeForm() {
    q("#duel-type-form").reset();
    q("#duel-type-id").value = "";
    q("#duel-type-form-title").textContent = "Nuevo tipo de duelo";
    q("#duel-type-save-btn").textContent = "Crear";
  }

  async function saveDuelType() {
    const id = q("#duel-type-id").value;
    const payload = {
      name: q("#duel-type-name").value.trim(),
      logic_rule: q("#duel-type-rule").value,
      description: q("#duel-type-description").value.trim(),
    };
    if (payload.name.length < 3) { toast("El nombre necesita 3 caracteres o más.", "err"); return; }
    try {
      if (id) {
        await API.put(`/admin/duel-types/${id}`, payload);
        toast("Tipo de duelo modificado.");
      } else {
        await API.post("/admin/duel-types", payload);
        toast("Tipo de duelo creado.");
      }
      resetDuelTypeForm();
      await loadDuelTypes();
    } catch (err) { toast(err.message, "err"); }
  }

  function editDuelType(id) {
    const t = duelTypesCache.find((x) => x.id === id);
    if (!t) return;
    q("#duel-type-id").value = t.id;
    q("#duel-type-name").value = t.name;
    q("#duel-type-rule").value = t.logic_rule;
    q("#duel-type-description").value = t.description || "";
    q("#duel-type-form-title").textContent = `Modificar tipo #${t.id}`;
    q("#duel-type-save-btn").textContent = "Guardar cambios";
    q("#duel-type-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteDuelType(id) {
    if (!confirm("¿Eliminar este tipo de duelo?")) return;
    try {
      await API.del(`/admin/duel-types/${id}`);
      toast("Tipo de duelo eliminado.");
      if (String(q("#duel-type-id").value) === String(id)) resetDuelTypeForm();
      await loadDuelTypes();
    } catch (err) { toast(err.message, "err"); }
  }

  /* ══════════════ 2. Carga de cartelera ══════════════ */
  async function loadRaces() {
    const races = await API.get("/races");
    const container = q("#races-admin-list");
    if (!races.length) {
      container.innerHTML = emptyState("La cartelera está vacía. Sube el archivo oficial (reporte INH o CSV).");
      return;
    }
    const byRace = {};
    races.forEach((r) => { (byRace[r.race_number] = byRace[r.race_number] || []).push(r); });

    container.innerHTML = Object.keys(byRace)
      .sort((a, b) => Number(a) - Number(b))
      .map((raceNumber) => {
        const rows = byRace[raceNumber];
        const isClosed = rows.some((h) => h.is_closed === true);
        const btnClass = isClosed ? "btn-success" : "btn-warning";
        const btnText = isClosed ? "🔓 Abrir carrera" : "🔒 Cerrar carrera";
        const statusBadge = isClosed 
          ? '<span class="badge badge-danger">CERRADA</span>' 
          : '<span class="badge badge-success">ABIERTA</span>';

        return `
        <div class="card">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <p class="font-bold text-sm text-slate-900">🏁 Carrera ${raceNumber}</p>
              ${statusBadge}
            </div>
            <div class="flex items-center gap-2">
              <button class="btn btn-sm ${btnClass}" data-action="toggle-close-race" data-race="${raceNumber}">
                ${btnText}
              </button>
              <button class="btn btn-danger btn-sm" title="Eliminar carrera completa" data-action="delete-entire-race" data-race="${raceNumber}">
                🗑 Eliminar carrera
              </button>
              <span class="text-[11px] text-slate-500">${esc(rows[0].race_datetime || "")} · ${rows.length} caballos</span>
            </div>
          </div>
          <ul class="divide-y divide-slate-100">
            ${rows.map((h) => `
              <li class="flex items-center justify-between py-1.5 text-sm">
                <span><b class="text-slate-700">N.º ${h.horse_number}</b> —${esc(h.horse_name)}</span>
                <button class="btn btn-danger btn-sm" title="Quitar de la cartelera"
                        data-action="delete-race" data-id="${h.id}">🗑</button>
              </li>`).join("")}
          </ul>
        </div>`;
      }).join("");
  }

  async function uploadRaces() {
    const input = q("#race-file");
    const file = input && input.files && input.files[0];
    if (!file) { 
      toast("Selecciona primero el archivo (reporte INH, CSV o Excel .xlsx/.xls).", "err"); 
      return; 
    }
    const btn = q("#upload-race-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Procesando…";
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await API.upload("/admin/races/upload", fd);

      const raceList = (res.races || [])
        .map((r) => `#${r.race_number} · ${esc(r.datetime || '')} · ${r.horses} ejemplares`)
        .join("<br>");
        
      q("#upload-result").innerHTML = `
        <div class="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 space-y-1 mt-2">
          <p class="font-bold">✅ ${esc(res.detail || "Cartelera procesada")}</p>
          <p>
            Formato: <b>${esc(res.format_label || res.format || "—")}</b> ·
            Codificación: <b>${esc(res.encoding || "—")}</b><br>
            Nuevas: <b>${res.imported}</b> · Actualizadas: <b>${res.updated}</b> ·
            Total ejemplares: <b>${res.total_rows}</b>
          </p>
          ${raceList ? `<p class="border-t border-emerald-200 pt-1">Carreras importadas:<br>${raceList}</p>` : ""}
        </div>`;
      toast(`Importación masiva OK: ${res.total_rows} ejemplares ✓`);
      input.value = "";
      await loadRaces();
    } catch (err) {
      const detail = err.detail;
      if (detail && Array.isArray(detail.errors)) {
        const list = detail.errors
          .slice(0, 20)
          .map((e) => `<li>${esc(e)}</li>`)
          .join("");
        const more = detail.errors.length > 20
          ? `<li>… y ${detail.errors.length - 20} error(es) más</li>` : "";
        q("#upload-result").innerHTML = `
          <div class="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 space-y-1 mt-2">
            <p class="font-bold">⚠ ${esc(detail.message || "Errores de importación")}</p>
            <ul class="list-disc pl-4 space-y-0.5">${list}${more}</ul>
          </div>`;
      } else {
        q("#upload-result").innerHTML =
          `<div class="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-bold text-red-700 mt-2">⚠ ${esc(err.message || "Error al procesar archivo")}</div>`;
      }
      toast(err.message || "Error en la carga", "err");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "⬆ Procesar archivo";
      }
    }
  }

  async function deleteRace(id) {
    if (!confirm("¿Eliminar esta entrada de la cartelera?")) return;
    try {
      await API.del(`/admin/races/${id}`);
      toast("Entrada eliminada.");
      await loadRaces();
    } catch (err) { toast(err.message, "err"); }
  }

  async function toggleCloseRace(raceNumber) {
    try {
      const res = await API.post(`/admin/races/${raceNumber}/toggle-close`, {});
      toast(res.detail || "Estatus de carrera actualizado ✓");
      await loadRaces();
    } catch (err) {
      toast(err.message || "Error al cambiar el estatus de la carrera", "err");
    }
  }

  /* ══════════════ 3. Resolver duelos ══════════════ */
  function predictedWinner(duel) {
    if (duel.logic_rule === "LOWEST_HORSE_NUMBER") return Math.min(duel.horse_creator, duel.horse_opponent);
    if (duel.logic_rule === "HIGHEST_HORSE_NUMBER") return Math.max(duel.horse_creator, duel.horse_opponent);
    return null;
  }

  function duelSideSummary(d) {
    return `N.º ${d.horse_creator} vs N.º ${d.horse_opponent}`;
  }

  function officialOutcomeClient(posMap, duel) {
    const isSingleHorse = (duel.horse_creator === duel.horse_opponent);
    if (isSingleHorse) {
      const pos = posMap[duel.horse_creator];
      const typeName = (duel.duel_type_name || "").toUpperCase();
      let creatorWins = false;
      if (typeName.includes("PELO A PELO")) {
        creatorWins = (pos === 1);
      } else if (typeName.includes("2 PUESTOS")) {
        creatorWins = (pos !== undefined && pos <= 2);
      } else if (typeName.includes("3 PUESTOS")) {
        creatorWins = (pos !== undefined && pos <= 3);
      } else {
        creatorWins = (pos === 1);
      }

      if (creatorWins) {
        return {
          winner: duel.horse_creator,
          note: `N.º ${duel.horse_creator} llegó ${pos}° — Cumple condición (Gana el Creador).`,
          isAcceptorWin: false
        };
      } else {
        const posText = pos ? `llegó ${pos}°` : "quedó fuera del top 5";
        return {
          winner: duel.acceptor_id,
          note: `N.º ${duel.horse_creator} ${posText} — No cumple condición (Gana el Aceptador).`,
          isAcceptorWin: true
        };
      }
    }

    const pa = posMap[duel.horse_creator];
    const pb = posMap[duel.horse_opponent];
    if (pa && pb) {
      if (pa < pb) {
        return {
          winner: duel.horse_creator,
          note: `N.º ${duel.horse_creator} llegó ${pa}° y N.º ${duel.horse_opponent} ${pb}°.`,
          isAcceptorWin: false
        };
      }
      return {
        winner: duel.horse_opponent,
        note: `N.º ${duel.horse_opponent} llegó ${pb}° y N.º ${duel.horse_creator} ${pa}°.`,
        isAcceptorWin: false
      };
    }
    if (pa) return { winner: duel.horse_creator, note: `N.º ${duel.horse_opponent} quedó fuera del top 5 (no clasificado).`, isAcceptorWin: false };
    if (pb) return { winner: duel.horse_opponent, note: `N.º ${duel.horse_creator} quedó fuera del top 5 (no clasificado).`, isAcceptorWin: false };
    return { winner: null, note: "Ninguno clasificó en el top 5 → reembolso sin comisión.", isAcceptorWin: false };
  }

  function resolveCard(duel, officialByRace = {}) {
    const pot = Math.round(duel.stake * 2 * 100) / 100;
    const commission = Math.round(pot * 0.05 * 100) / 100;
    const payout = Math.round((pot - commission) * 100) / 100;
    const isTie = duel.logic_rule === "TIE_REFUND";
    const isOfficialRule = duel.logic_rule === "OFFICIAL_FINISH";
    const isNumericRule =
      duel.logic_rule === "LOWEST_HORSE_NUMBER" || duel.logic_rule === "HIGHEST_HORSE_NUMBER";
    const predicted = predictedWinner(duel);

    const official = officialByRace[duel.race_number] || null;
    const posMap = official
      ? Object.fromEntries(official.map((o) => [o.horse_number, o.position]))
      : null;
    const suggestion = posMap ? officialOutcomeClient(posMap, duel) : null;
    const officialLine = official
      ? `<p class="text-[11px] text-slate-600 my-1">🏁 Marcador oficial: ${official
          .map((o) => `${o.position}° N.º ${o.horse_number}`)
          .join(" · ")}</p>`
      : "";

    let winnerField;
    if (isOfficialRule) {
      if (!official) {
        winnerField = `<p class="text-xs font-bold text-red-600">⛔ Sin marcador oficial: registra el 1° al 5° lugar de la carrera ${duel.race_number} en «Resultados oficiales».</p>`;
      } else if (suggestion.winner) {
        if (suggestion.isAcceptorWin) {
          winnerField = `<p class="text-xs font-bold text-amber-700">⚠️ ${esc(suggestion.note)}</p>`;
        } else {
          winnerField = `<p class="text-xs font-bold text-emerald-700">🏆 Según el marcador oficial gana el caballo N.º ${suggestion.winner}. ${esc(suggestion.note)}</p>`;
        }
      } else {
        winnerField = `<p class="text-xs font-bold text-amber-700">⚠ ${esc(suggestion.note)}</p>`;
      }
    } else if (isTie) {
      winnerField = '<p class="text-xs text-slate-500">Regla de empate: al resolver se reembolsa el 100 % a ambos, sin comisión.</p>';
    } else {
      const preselect = !isNumericRule && suggestion && !suggestion.isAcceptorWin && suggestion.winner ? suggestion.winner : predicted;
      winnerField = `
      <div>
        <label class="label" for="winner-${duel.id}">Caballo ganador oficial</label>
        <select id="winner-${duel.id}" class="select" data-winner-for="${duel.id}">
          <option value="${duel.horse_creator}" ${preselect === duel.horse_creator ? "selected" : ""}>
            N.º ${duel.horse_creator} — ${esc(duel.horse_creator_name)}
          </option>
          <option value="${duel.horse_opponent}" ${preselect === duel.horse_opponent ? "selected" : ""}>
            N.º ${duel.horse_opponent} — ${esc(duel.horse_opponent_name)}
          </option>
        </select>
        ${!suggestion && predicted !== null ? `<p class="text-[11px] text-emerald-700 font-bold mt-1">⚙ La regla calcula el ganador: N.º ${predicted}</p>` : ""}
        ${suggestion ? `<p class="text-[11px] text-slate-500 mt-1">💡 ${esc(suggestion.note)}</p>` : ""}
      </div>`;
    }

    const resolveDisabled = isOfficialRule && !official;
    let resolveLabel = isTie
      ? "Declarar empate y reembolsar"
      : `Resolver · pagar ${fmt(payout)} al ganador`;
    if (isOfficialRule && official && suggestion && !suggestion.winner) {
      resolveLabel = "Reembolsar · ambos fuera del top 5";
    } else if (isOfficialRule && official && suggestion && suggestion.isAcceptorWin) {
      resolveLabel = `Resolver · pagar ${fmt(payout)} al Aceptador`;
    }

    return `
    <article class="card">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="font-bold text-sm text-slate-900">Duelo #${duel.id} · ${esc(duel.duel_type_name)}</p>
          <p class="text-[11px] text-slate-500">Carrera ${duel.race_number} · ${esc(RULE_LABEL[duel.logic_rule] || duel.logic_rule)}</p>
        </div>
        ${badge(duel.status)}
      </div>
      ${officialLine}
      <p class="text-xs text-slate-700 my-2">
        <b>N.º ${duel.horse_creator} ${esc(duel.horse_creator_name)}</b> (${esc(duel.creator_username)})
        vs <b>N.º ${duel.horse_opponent} ${esc(duel.horse_opponent_name)}</b> (${esc(duel.acceptor_username || "—")})
      </p>
      <div class="rounded-xl bg-slate-50 border border-slate-200 p-2 text-xs grid grid-cols-3 gap-1 text-center mb-3">
        <div><p class="text-slate-400 uppercase text-[9px]">Stake</p><b class="money">${fmt(duel.stake)}</b></div>
        <div><p class="text-slate-400 uppercase text-[9px]">Pozo</p><b class="money">${fmt(pot)}</b></div>
        <div><p class="text-slate-400 uppercase text-[9px]">Comisión 5 %</p><b class="money">${fmt(commission)}</b></div>
      </div>
      <div class="space-y-2">
        ${winnerField}
        <div>
          <label class="label" for="note-${duel.id}">Nota de resolución (opcional)</label>
          <input id="note-${duel.id}" class="input" data-note-for="${duel.id}" placeholder="Ej. Resultado oficial de la carrera" />
        </div>
        <button class="btn btn-primary" data-action="resolve-duel" data-id="${duel.id}" ${resolveDisabled ? "disabled" : ""}>
          ✅ ${resolveLabel}
        </button>
      </div>
    </article>`;
  }

  async function loadResolve() {
    const [active, open, resolved] = await Promise.all([
      API.get("/admin/duels?status=ACTIVE"),
      API.get("/admin/duels?status=OPEN"),
      API.get("/admin/duels?status=RESOLVED"),
    ]);

    const officialByRace = {};
    const raceNumbers = [...new Set(active.map((d) => d.race_number))];
    await Promise.all(
      raceNumbers.map(async (n) => {
        try {
          const data = await API.get(`/admin/races/${n}/official-results`);
          if (data.results && data.results.length) officialByRace[n] = data.results;
        } catch (_) { /* carrera sin marcador o no disponible */ }
      })
    );

    q("#resolve-list").innerHTML = active.length
      ? active.map((d) => resolveCard(d, officialByRace)).join("")
      : emptyState("No hay duelos activos pendientes de resolución.");

    q("#resolve-open-list").innerHTML = open.length
      ? open.map((d) => `
        <div class="flex items-center justify-between text-xs py-1 border-b border-slate-100">
          <span>#${d.id} · Carrera ${d.race_number} · ${esc(duelSideSummary(d))}</span>
          <b class="money">${fmt(d.stake)}</b>
        </div>`).join("")
      : '<p class="text-xs text-slate-400">Sin duelos abiertos.</p>';

    q("#resolve-resolved-list").innerHTML = resolved.length
      ? resolved.map((d) => `
        <div class="flex items-center justify-between text-xs py-1 border-b border-slate-100">
          <span>#${d.id} · ${esc(d.winner_username || "Empate/reembolso")} · <span class="text-emerald-700">comisión ${fmt(d.commission_amount)}</span></span>
          <b class="money">${fmt(d.pot)}</b>
        </div>`).join("")
      : '<p class="text-xs text-slate-400">Aún no hay duelos resueltos.</p>';
  }

  async function resolveDuel(id, btn) {
    const inOfficial = btn.closest && btn.closest("#official-status");
    const winnerSel = inOfficial ? null : document.querySelector(`[data-winner-for="${id}"]`);
    const noteEl = inOfficial ? null : document.querySelector(`[data-note-for="${id}"]`);
    const body = {};
    if (winnerSel) body.winner_horse_number = Number(winnerSel.value);
    if (noteEl && noteEl.value.trim()) body.note = noteEl.value.trim();

    btn.disabled = true;
    try {
      const res = await API.post(`/admin/duels/${id}/resolve`, body);
      if (res.commission > 0) {
        toast(`Duelo #${id} resuelto ✓ Pozo ${fmt(res.pot)} → comisión ${fmt(res.commission)}, ganador ${fmt(res.payout)}.`);
      } else {
        toast(`Duelo #${id} resuelto ✓ Reembolso sin comisión (escrow devuelto).`);
      }
      await Promise.all([loadResolve(), refreshMe()]);
      if (App.view === "admin-results") await loadOfficialResults();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false;
    }
  }

  /* ══════════════ 4. Recargas y retiros ══════════════ */
  async function loadRequests() {
    const [topups, withdrawals] = await Promise.all([
      API.get(`/admin/topups?status=${filters.topups}`),
      API.get(`/admin/withdrawals?status=${filters.withdrawals}`),
    ]);

    q("#topups-admin-list").innerHTML = topups.length
      ? topups.map((r) => `
        <article class="card card-tight">
          <div class="flex justify-between items-start gap-2">
            <div class="text-xs min-w-0">
              <p class="font-bold text-sm text-slate-900">${esc(r.username)} · <span class="money">${fmt(r.amount)}</span></p>
              <p class="text-slate-500">Ref ${esc(r.reference)} · desde ${esc(r.wallet_phone)}</p>
              <p class="text-slate-400">${esc(r.created_at || "")}</p>
            </div>
            ${badge(r.status)}
          </div>
          ${r.status === "PENDING" ? `
          <div class="grid grid-cols-2 gap-2 mt-2">
            <button class="btn btn-primary btn-sm" data-action="approve-topup" data-id="${r.id}">✓ Aprobar y abonar</button>
            <button class="btn btn-danger btn-sm" data-action="reject-topup" data-id="${r.id}">✕ Rechazar</button>
          </div>` : ""}
        </article>`).join("")
      : emptyState("Sin recargas para este filtro.");

    q("#withdrawals-admin-list").innerHTML = withdrawals.length
      ? withdrawals.map((r) => `
        <article class="card card-tight">
          <div class="flex justify-between items-start gap-2">
            <div class="text-xs min-w-0">
              <p class="font-bold text-sm text-slate-900">${esc(r.username)} · <span class="money">${fmt(r.amount)}</span></p>
              <p class="text-slate-500">Destino ${esc(r.destination_phone)}</p>
              <p class="text-slate-400">${esc(r.created_at || "")}</p>
            </div>
            ${badge(r.status)}
          </div>
          ${r.status === "PENDING" ? `
          <div class="grid grid-cols-2 gap-2 mt-2">
            <button class="btn btn-primary btn-sm" data-action="pay-withdrawal" data-id="${r.id}">✓ Marcar pagado</button>
            <button class="btn btn-danger btn-sm" data-action="reject-withdrawal" data-id="${r.id}">✕ Rechazar (reembolsar)</button>
          </div>` : ""}
        </article>`).join("")
      : emptyState("Sin retiros para este filtro.");
  }

  async function reloadRequests() { await loadRequests(); }

  /* ══════════════ 5. Banco ══════════════ */
  async function loadBank() {
    const bank = await API.get("/bank").catch(() => null);
    if (bank) {
      q("#bank-name").value = bank.bank_name || "";
      q("#bank-phone").value = bank.phone || "";
      q("#bank-id").value = bank.id_number || "";
      q("#bank-type").value = bank.account_type || "";
      q("#bank-holder").value = bank.holder_name || "";
    }
  }

  async function saveBank() {
    try {
      await API.put("/admin/bank", {
        bank_name: q("#bank-name").value.trim(),
        phone: q("#bank-phone").value.trim(),
        id_number: q("#bank-id").value.trim(),
        account_type: q("#bank-type").value.trim(),
        holder_name: q("#bank-holder").value.trim(),
      });
      toast("Datos bancarios guardados ✓");
    } catch (err) { toast(err.message, "err"); }
  }

  /* ══════════════ 6. Auditoría y Superadmin ══════════════ */
  let auditCache = null;

  async function loadAudit() {
    const [audit, users] = await Promise.all([
      API.get("/admin/audit"),
      API.get("/admin/users"),
    ]);
    auditCache = { audit, users };

    q("#audit-kpis").innerHTML = [
      kpi("Usuarios", audit.users.count, `Balances: ${fmt(audit.users.total_balance)}`),
      kpi("Duelos resueltos", audit.duels.resolved, `Volumen: ${fmt(audit.duels.resolved_volume)}`),
      kpi("Comisiones 5 %", fmt(audit.duels.commissions), `Pagado a ganadores: ${fmt(audit.duels.payouts_to_winners)}`),
      kpi("Escrow retenido", fmt(audit.escrow.total_held), `Abiertos ${fmt(audit.escrow.held_open)} · Activos ${fmt(audit.escrow.held_active)}`),
      kpi("Recargas aprobadas", fmt(audit.payments.topups_approved_volume), `Pendientes: ${fmt(audit.payments.topups_pending_volume)}`),
      kpi("Retiros pagados", fmt(audit.payments.withdrawals_paid_volume), `Pendientes: ${fmt(audit.payments.withdrawals_pending_volume)}`),
    ].join("");

    q("#audit-commissions").innerHTML = `
      <div class="flex justify-between"><span class="text-slate-500">Duelos abiertos / activos / resueltos</span><b>${audit.duels.open} / ${audit.duels.active} / ${audit.duels.resolved}</b></div>
      <div class="flex justify-between"><span class="text-slate-500">Volumen resuelto (pozos)</span><b class="money">${fmt(audit.duels.resolved_volume)}</b></div>
      <div class="flex justify-between text-emerald-700"><span>Comisión retenida (5 %)</span><b class="money">${fmt(audit.duels.commissions)}</b></div>
      <div class="flex justify-between"><span class="text-slate-500">Abonado a ganadores (95 %)</span><b class="money">${fmt(audit.duels.payouts_to_winners)}</b></div>`;

    q("#audit-users-list").innerHTML = users.length
      ? users.map((u) => `
        <div class="card card-tight flex items-center justify-between text-sm">
          <div>
            <p class="font-bold text-slate-900">${esc(u.username)}</p>
            <p class="text-[11px] text-slate-400">${u.role === "superadmin" ? "Superadmin" : u.role === "admin" ? "Administrador" : "Usuario"} · #${u.id}</p>
          </div>
          <div class="flex items-center gap-3">
            <b class="money text-emerald-700">${fmt(u.balance)}</b>
            ${guard() ? `
              <button class="btn btn-ghost btn-sm text-xs px-2 py-1" data-action="edit-user-balance" data-id="${u.id}" data-username="${esc(u.username)}" data-balance="${u.balance}" title="Ajustar balance">💵</button>
            ` : ""}
          </div>
        </div>`).join("")
      : emptyState("No hay cuentas registradas.");

    // Enlazar botón de exportación a Excel de forma directa y segura
    const btnExcel = q("#export-audit-excel");
    if (btnExcel) {
      btnExcel.onclick = (e) => {
        e.preventDefault();
        exportAuditToExcel();
      };
    }

    // Sección de creación de Administradores exclusiva para el Superadmin
    let superadminSection = q("#superadmin-section");
    if (isSuperadmin()) {
      if (!superadminSection) {
        superadminSection = document.createElement("div");
        superadminSection.id = "superadmin-section";
        superadminSection.className = "card p-4 mt-6 border-amber-500 border";
        q("#audit-users-list")?.parentNode?.insertBefore(superadminSection, q("#audit-users-list").nextSibling);
      }
      superadminSection.innerHTML = `
        <h3 class="font-bold text-lg text-amber-600 mb-2">⚡ Panel de Superadmin: Crear Administrador</h3>
        <p class="text-xs text-slate-500 mb-4">Registra nuevos usuarios con privilegios de operador o superadministrador.</p>
        <form id="form-create-admin" class="flex flex-col gap-3">
          <div>
            <label class="block text-xs font-semibold mb-1">Nombre de usuario</label>
            <input type="text" id="admin-new-username" class="input w-full" required />
          </div>
          <div>
            <label class="block text-xs font-semibold mb-1">Contraseña</label>
            <input type="password" id="admin-new-password" class="input w-full" required />
          </div>
          <div>
            <label class="block text-xs font-semibold mb-1">Nivel de Rol</label>
            <select id="admin-new-role" class="input w-full">
              <option value="admin">Administrador (Gestión operativa)</option>
              <option value="superadmin">Superadmin (Control total)</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary mt-2">Crear Usuario con Permisos</button>
        </form>
      `;
    } else if (superadminSection) {
      superadminSection.remove();
    }
  }

  function exportAuditToExcel() {
    if (!auditCache || !auditCache.users) {
      toast("Cargando datos de auditoría...", "info");
      loadAudit().then(() => exportAuditToExcel());
      return;
    }

    const { audit, users } = auditCache;

    let csvContent = "\uFEFF"; // BOM UTF-8 para Excel
    csvContent += "REPORTE DE AUDITORIA FINANCIERA Y BALANCES - BANCA HIPICA P2P\n";
    csvContent += `Fecha de Generacion;${new Date().toLocaleString("es-VE")}\n\n`;

    csvContent += "--- METRICAS GENERALES ---\n";
    csvContent += "Concepto;Valor\n";
    csvContent += `Usuarios Registrados;${audit.users.count}\n`;
    csvContent += `Balance Total de Usuarios;${audit.users.total_balance}\n`;
    csvContent += `Duelos Resueltos;${audit.duels.resolved}\n`;
    csvContent += `Volumen Resuelto (Pozos);${audit.duels.resolved_volume}\n`;
    csvContent += `Comisiones Retenidas (5%);${audit.duels.commissions}\n`;
    csvContent += `Abonado a Ganadores (95%);${audit.duels.payouts_to_winners}\n`;
    csvContent += `Escrow Retenido (Total);${audit.escrow.total_held}\n`;
    csvContent += `Recargas Aprobadas;${audit.payments.topups_approved_volume}\n`;
    csvContent += `Retiros Pagados;${audit.payments.withdrawals_paid_volume}\n\n`;

    csvContent += "--- LISTADO DE CUENTAS Y BALANCES ---\n";
    csvContent += "ID;Usuario;Rol;Balance ($)\n";
    users.forEach((u) => {
      csvContent += `${u.id};${u.username};${u.role};${u.balance}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Auditoria_BancaHipica_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast("Reporte de auditoría exportado a Excel ✓");
  }

  async function adjustUserBalance(userId, username, currentBalance) {
    const newBalStr = prompt(`Ajustar balance de @${username} (Balance actual: $${currentBalance}):`, currentBalance);
    if (newBalStr === null) return;
    const newBalance = parseFloat(newBalStr);
    if (isNaN(newBalance) || newBalance < 0) {
      toast("Monto de balance no válido.", "err");
      return;
    }
    try {
      await API.post(`/admin/users/${userId}/balance`, { balance: newBalance });
      toast(`Balance de @${username} actualizado a $${newBalance} ✓`);
      await loadAudit();
    } catch (err) {
      toast(err.message || "Error al actualizar balance", "err");
    }
  }

  async function createAdminUser(e) {
    e.preventDefault();
    const username = q("#admin-new-username").value.trim();
    const password = q("#admin-new-password").value;
    const role = q("#admin-new-role").value;

    try {
      const res = await API.post("/superadmin/users/create", { username, password, role });
      toast(res.detail || "Usuario administrativo creado exitosamente", "success");
      q("#form-create-admin").reset();
      await loadAudit();
    } catch (err) {
      toast(err.message || "Error al crear el usuario administrador", "err");
    }
  }

  /* ══════════════ 7. Resultados oficiales (1° al 5° con soporte de Empates, Historial y Edición) ══════════════ */
  let officialRacesCache = [];
  let currentSelectedRaceNumber = null;
  let arrivalFormState = { 1: null, 2: null, 3: null, 4: null, 5: null };
  let arrivalTieState = { 1: false, 2: false, 3: false, 4: false, 5: false };

  async function loadOfficialResults() {
    officialRacesCache = await API.get("/races");
    const container = q("#official-race-pills-container") || q("#official-race-select")?.parentElement;
    
    const raceNumbers = [...new Set(officialRacesCache.map((r) => r.race_number))]
      .sort((a, b) => a - b);

    if (!raceNumbers.length) {
      if (container) container.innerHTML = emptyState("La cartelera está vacía.");
      q("#official-status").innerHTML = "";
      return;
    }

    if (!currentSelectedRaceNumber || !raceNumbers.includes(currentSelectedRaceNumber)) {
      currentSelectedRaceNumber = raceNumbers[0];
    }

    if (container) {
      container.innerHTML = `
        <label class="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Seleccionar Carrera</label>
        <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar" id="official-race-pills">
          ${raceNumbers.map((n) => {
            const first = officialRacesCache.find((r) => r.race_number === n);
            const timeStr = first.race_datetime ? first.race_datetime.split(" ")[1] || first.race_datetime : "";
            const isSelected = n === currentSelectedRaceNumber;
            return `
              <button type="button" data-race-num="${n}"
                      class="official-race-pill shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all select-none
                             ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}">
                Carrera ${n}${timeStr ? '· ' + esc(timeStr) : ''}
              </button>
            `;
          }).join("")}
        </div>
      `;

      container.querySelectorAll(".official-race-pill").forEach((btn) => {
        btn.addEventListener("click", () => {
          currentSelectedRaceNumber = Number(btn.dataset.raceNum);
          
          container.querySelectorAll(".official-race-pill").forEach((b) => {
            const isSelected = Number(b.dataset.raceNum) === currentSelectedRaceNumber;
            b.classList.toggle("bg-slate-900", isSelected);
            b.classList.toggle("text-white", isSelected);
            b.classList.toggle("border-slate-900", isSelected);
            b.classList.toggle("shadow-sm", isSelected);
            b.classList.toggle("bg-white", !isSelected);
            b.classList.toggle("text-slate-700", !isSelected);
            b.classList.toggle("border-slate-200", !isSelected);
          });

          refreshOfficialDetail().catch((e) => toast(e.message, "err"));
        });
      });
    }

    await refreshOfficialDetail();
  }

  async function refreshOfficialDetail() {
    const raceNumber = currentSelectedRaceNumber;
    const statusEl = q("#official-status");
    if (!raceNumber) {
      statusEl.innerHTML = emptyState("Selecciona una carrera.");
      return;
    }

    const raceEntries = officialRacesCache.filter((r) => r.race_number === Number(raceNumber));

    let data = null;
    try {
      data = await API.get(`/admin/races/${raceNumber}/official-results`);
    } catch (_) { data = { has_results: false, results: [], active_duels: [] }; }

    arrivalFormState = { 1: null, 2: null, 3: null, 4: null, 5: null };
    arrivalTieState = { 1: false, 2: false, 3: false, 4: false, 5: false };

    if (data.has_results && data.results) {
      data.results.forEach((r) => {
        arrivalFormState[r.position] = r.horse_number;
        arrivalTieState[r.position] = Boolean(r.is_tie);
      });
    }

    const medals = { 1: "🥇", 2: "🥈", 3: "🥉", 4: "4️⃣", 5: "5️⃣" };
    const labels = { 1: "1.º Lugar", 2: "2.º Lugar", 3: "3.º Lugar", 4: "4.º Lugar", 5: "5.º Lugar" };

    const rowsHtml = [1, 2, 3, 4, 5].map((pos) => {
      const currentVal = arrivalFormState[pos] || "";
      const isTieChecked = arrivalTieState[pos] ? "checked" : "";
      
      const options = raceEntries.map((h) => {
        let rawName = String(h.horse_name || "");
        rawName = rawName.split(/Precio/i)[0];
        rawName = rawName.replace(/^(N[º°.]\s*\d+|[-–—]+)\s*/i, "").trim();
        rawName = rawName.replace(/[-–—:$]+$/, "").trim();

        return `
          <option value="${h.horse_number}" ${Number(currentVal) === Number(h.horse_number) ? "selected" : ""}>
            ${h.horse_number} — ${esc(rawName)}
          </option>
        `;
      }).join("");

      return `
        <div class="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-1.5 min-w-[90px]">
            <span class="text-base">${medals[pos]}</span>
            <span class="text-xs font-bold text-slate-700 uppercase">${labels[pos]}</span>
          </div>
          
          <div class="flex-1">
            <select id="official-horse-${pos}" data-arrival-pos="${pos}" class="select text-xs font-semibold">
              <option value="">-- Seleccionar ejemplar --</option>
              ${options}
            </select>
          </div>

          <div class="flex items-center gap-1.5 shrink-0 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <input type="checkbox" id="official-tie-${pos}" data-tie-pos="${pos}" class="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer" ${isTieChecked} />
            <label for="official-tie-${pos}" class="text-[11px] font-bold text-slate-600 cursor-pointer select-none">Empate</label>
          </div>
        </div>
      `;
    }).join("");

    let historyCard = "";
    if (data.has_results && data.results && data.results.length > 0) {
      historyCard = `
        <div class="card bg-slate-900 text-white border-slate-800 space-y-2">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <p class="font-bold text-xs uppercase tracking-wider text-emerald-400">📋 Historial / Marcador Oficial Vigente</p>
            <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">Carrera ${raceNumber}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
            ${data.results.map((r) => `
              <div class="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 text-center">
                <p class="text-[10px] text-slate-400 uppercase font-bold">${r.position}° Lugar${r.is_tie ? ' · (Empate)' : ''}</p>
                <p class="text-sm font-black text-emerald-300 mt-0.5">N.º ${r.horse_number}</p>
                <p class="text-[11px] text-slate-200 truncate font-medium mt-0.5">${esc(r.horse_name)}</p>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    const duelsHtml = (data.active_duels || []).length
      ? data.active_duels.map((d) => officialDuelCard(d)).join("")
      : emptyState("No hay duelos activos en esta carrera.");

    statusEl.innerHTML = `
      ${historyCard}

      <div class="card space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-bold text-sm text-slate-900">🏁 Editor de Llegada Oficial — Carrera ${raceNumber}</p>
            <p class="text-[11px] text-slate-500">${data.has_results ? 'Marcador registrado previamente. Modifica los campos necesarios y actualiza.' : 'Asigna los puestos oficiales y marca empate si aplica.'}</p>
          </div>
          ${data.has_results ? '<span class="badge badge-resolved">Registrado / Editable</span>' : '<span class="badge badge-pending">Pendiente</span>'}
        </div>

        <div class="space-y-2.5" id="arrival-rows-container">
          ${rowsHtml}
        </div>

        <button type="button" id="save-official-arrival-btn" class="btn btn-primary w-full py-3 rounded-xl font-bold text-sm shadow-md">
          💾 Guardar / Actualizar Marcador Oficial
        </button>
      </div>

      <div class="mt-4">
        <h3 class="font-bold text-slate-900 text-sm mb-2">Duelos activos de la carrera</h3>
        <div class="space-y-2">${duelsHtml}</div>
      </div>
    `;

    q("#save-official-arrival-btn")?.addEventListener("click", () => {
      saveOfficialResults().catch((e) => toast(e.message, "err"));
    });
  }

  function officialDuelCard(d) {
    const isNumeric = d.logic_rule === "LOWEST_HORSE_NUMBER" || d.logic_rule === "HIGHEST_HORSE_NUMBER";
    let action = "";
    if (d.has_results) {
      if (isNumeric) {
        action = `<button class="btn btn-ghost btn-sm" data-action="resolve-duel" data-id="${d.duel_id}">
          ✅ Resolver por regla numérica
        </button>`;
      } else if (d.suggested_winner_horse) {
        action = `<button class="btn btn-primary btn-sm" data-action="resolve-duel" data-id="${d.duel_id}">
          ✅ Resolver · gana N.º ${d.suggested_winner_horse}
        </button>`;
      } else if (d.logic_rule === "TIE_REFUND") {
        action = `<button class="btn btn-warn btn-sm" data-action="resolve-duel" data-id="${d.duel_id}">
          ↩ Reembolsar (empate)
        </button>`;
      } else {
        action = `<button class="btn btn-warn btn-sm" data-action="resolve-duel" data-id="${d.duel_id}">
          ↩ Reembolsar · ambos fuera del top 5
        </button>`;
      }
    }
    const noteClass = d.suggested_winner_horse ? "text-emerald-700 font-bold" : "text-slate-500";
    return `
    <article class="card card-tight">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="font-bold text-sm text-slate-900">Duelo #${d.duel_id} · ${esc(d.duel_type)}</p>
          <p class="text-[11px] text-slate-500">${esc(RULE_LABEL[d.logic_rule] || d.logic_rule)} · Pozo ${fmt(d.pot)}</p>
        </div>
        <span class="badge badge-active">Activo</span>
      </div>
      <p class="text-xs text-slate-700 my-2">
        <b>N.º ${d.horse_creator} ${esc(d.horse_creator_name)}</b> (${esc(d.creator_username)})
        vs <b>N.º ${d.horse_opponent} ${esc(d.horse_opponent_name)}</b> (${esc(d.acceptor_username || "—")})
      </p>
      <p class="text-xs ${noteClass}">💡 ${esc(d.note)}</p>
      ${action ? `<div class="mt-2">${action}</div>` : ""}
    </article>`;
  }

  async function saveOfficialResults() {
    const raceNumber = currentSelectedRaceNumber;
    if (!raceNumber) { toast("Selecciona una carrera.", "err"); return; }
    
    const positions = [];
    for (let i = 1; i <= 5; i++) {
      const horseSelect = q(`#official-horse-${i}`);
      const tieCheckbox = q(`#official-tie-${i}`);
      
      const horseNumber = horseSelect && horseSelect.value ? Number(horseSelect.value) : null;
      const isTie = tieCheckbox ? tieCheckbox.checked : false;

      if (!horseNumber) {
        toast(`Debes seleccionar un ejemplar para el ${i}.º lugar.`, "err");
        return;
      }
      positions.push({ position: i, horse_number: horseNumber, is_tie: isTie });
    }
    
    try {
      const res = await API.post(`/admin/races/${raceNumber}/official-results`, { positions });
      
      try {
        await API.post(`/admin/races/${raceNumber}/toggle-close`, {});
      } catch (_) {}

      toast(`Marcador guardado y Carrera ${raceNumber} cerrada ✓ Duelos procesados: ${res.active_duels ? res.active_duels.length : 0}.`);
      await Promise.all([refreshOfficialDetail(), loadResolve()]);
    } catch (err) {
      toast(err.message, "err");
    }
  }

  function switchRequestTab(which) {
    const topups = which === "topups";
    q("#panel-topups").classList.toggle("hidden", !topups);
    q("#panel-withdrawals").classList.toggle("hidden", topups);
    q("#tab-topups").classList.toggle("bg-white", topups);
    q("#tab-topups").classList.toggle("shadow", topups);
    q("#tab-topups").classList.toggle("text-slate-500", !topups);
    q("#tab-withdrawals").classList.toggle("bg-white", topups);
    q("#tab-withdrawals").classList.toggle("shadow", topups);
    q("#tab-withdrawals").classList.toggle("text-slate-500", topups);
    loadRequests().catch((e) => toast(e.message, "err"));
  }

  /* ══════════════ Enlaces de eventos ══════════════ */
  function bind() {
    // CRUD de tipos de duelo
    const duelTypeForm = q("#duel-type-form");
    if (duelTypeForm) {
      duelTypeForm.addEventListener("submit", (e) => { e.preventDefault(); saveDuelType(); });
    }
    const cancelDuelTypeBtn = q("#duel-type-cancel-btn");
    if (cancelDuelTypeBtn) {
      cancelDuelTypeBtn.addEventListener("click", resetDuelTypeForm);
    }

    // Cartelera (Carga e importación)
    const uploadBtn = q("#upload-race-btn");
    if (uploadBtn) {
      uploadBtn.onclick = null;
      uploadBtn.addEventListener("click", (e) => {
        e.preventDefault();
        uploadRaces().catch((err) => toast(err.message, "err"));
      });
    }

    const refreshRacesBtn = q("#refresh-races");
    if (refreshRacesBtn) {
      refreshRacesBtn.addEventListener("click", () => loadRaces().catch((e) => toast(e.message, "err")));
    }

    // Resolver y auditoría
    const refreshResolveBtn = q("#refresh-resolve");
    if (refreshResolveBtn) {
      refreshResolveBtn.addEventListener("click", () => loadResolve().catch((e) => toast(e.message, "err")));
    }
    const refreshAuditBtn = q("#refresh-audit");
    if (refreshAuditBtn) {
      refreshAuditBtn.addEventListener("click", () => loadAudit().catch((e) => toast(e.message, "err")));
    }

    // Banco
    const bankForm = q("#bank-form");
    if (bankForm) {
      bankForm.addEventListener("submit", (e) => { e.preventDefault(); saveBank(); });
    }

    // Resultados oficiales
    const refreshOfficialBtn = q("#refresh-official");
    if (refreshOfficialBtn) {
      refreshOfficialBtn.addEventListener("click", () => {
        loadOfficialResults().catch((e) => toast(e.message, "err"));
      });
    }

    // Pestañas y filtros de recargas/retiros
    const tabTopups = q("#tab-topups");
    if (tabTopups) {
      tabTopups.addEventListener("click", () => switchRequestTab("topups"));
    }
    const tabWithdrawals = q("#tab-withdrawals");
    if (tabWithdrawals) {
      tabWithdrawals.addEventListener("click", () => switchRequestTab("withdrawals"));
    }

    document.querySelectorAll(".req-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        filters[btn.dataset.kind] = btn.dataset.status;
        document.querySelectorAll(`.req-filter[data-kind="${btn.dataset.kind}"]`)
          .forEach((b) => b.classList.toggle("active", b === btn));
        loadRequests().catch((e) => toast(e.message, "err"));
      });
    });

    // Delegación global de envíos para formulario dinámico de superadmin
    document.addEventListener("submit", async (e) => {
      if (e.target && e.target.id === "form-create-admin") {
        await createAdminUser(e);
      }
    });

    // Delegación de acciones exclusivas del administrador y superadmin
    document.addEventListener("click", async (event) => {
      const el = event.target.closest("[data-action]");
      if (!el || !guard()) return;
      const action = el.dataset.action;
      const id = Number(el.dataset.id);
      const adminActions = [
        "edit-duel-type", "delete-duel-type", "delete-race", "resolve-duel",
        "approve-topup", "reject-topup", "pay-withdrawal", "reject-withdrawal",
        "toggle-close-race", "delete-entire-race", "edit-user-balance"
      ];

      if (!adminActions.includes(action)) return;

      try {
        if (action === "edit-duel-type") editDuelType(id);
        else if (action === "delete-duel-type") await deleteDuelType(id);
        else if (action === "delete-race") await deleteRace(id);
        else if (action === "toggle-close-race") await toggleCloseRace(el.dataset.race);
        else if (action === "delete-entire-race") {
          const raceNum = el.dataset.race;
          if (confirm(`¿Eliminar la Carrera ${raceNum} completa de la cartelera?`)) {
            await API.del(`/admin/races/by-number/${raceNum}`);
            toast(`Carrera ${raceNum} eliminada ✓`);
            await loadRaces();
          }
        }
        else if (action === "resolve-duel") await resolveDuel(id, el);
        else if (action === "edit-user-balance") {
          await adjustUserBalance(id, el.dataset.username, el.dataset.balance);
        }
        else if (action === "approve-topup") {
          await API.post(`/admin/topups/${id}/approve`, {});
          toast("Recarga aprobada ✓");
          await loadRequests();
        } else if (action === "reject-topup") {
          await API.post(`/admin/topups/${id}/reject`, {});
          toast("Recarga rechazada.");
          await loadRequests();
        } else if (action === "pay-withdrawal") {
          await API.post(`/admin/withdrawals/${id}/pay`, {});
          toast("Retiro marcado como pagado ✓");
          await loadRequests();
        } else if (action === "reject-withdrawal") {
          await API.post(`/admin/withdrawals/${id}/reject`, {});
          toast("Retiro rechazado y fondos devueltos.");
          await loadRequests();
        }
      } catch (err) {
        toast(err.message, "err");
      }
    });
  }

  /* ══════════════ Exportación pública del módulo ══════════════ */
  const publicApi = {
    bind,
    loadDuelTypes,
    loadRaces,
    uploadRaces,
    loadResolve,
    loadRequests,
    loadBank,
    loadAudit,
    loadOfficialResults
  };
  window.Admin = publicApi;
  return publicApi;
})();