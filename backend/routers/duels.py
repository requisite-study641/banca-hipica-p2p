"""Duelos P2P: creación con escrow, listado, aceptación y resolución administrativa."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import (
    DUEL_ACTIVE,
    DUEL_OPEN,
    DUEL_RESOLVED,
    FEE_PERCENTAGE,
    ROLE_ADMIN,
    RULE_HIGHEST,
    RULE_LOWEST,
    RULE_OFFICIAL,
    RULE_TIE,
    User,
    Duel,
    DuelType,
    RaceEntry,
    get_db,
    get_official_positions,
    official_outcome,
)
from ..schemas import DuelAccept, DuelCreate, ResolveDuel
from ..security import get_current_user, require_admin

router = APIRouter(tags=["duels"])


# ────────────────────────────── Serialización ──────────────────────────────
def _serialize(duel: Duel, db: Session) -> dict:
    data = duel.to_dict()
    duel_type = db.get(DuelType, duel.duel_type_id)
    creator = db.get(User, duel.creator_id)
    acceptor = db.get(User, duel.acceptor_id) if duel.acceptor_id else None
    winner = db.get(User, duel.winner_id) if duel.winner_id else None
    data.update(
        {
            "duel_type_name": duel_type.name if duel_type else "—",
            "logic_rule": duel_type.logic_rule if duel_type else None,
            "creator_username": creator.username if creator else "—",
            "acceptor_username": acceptor.username if acceptor else None,
            "winner_username": winner.username if winner else None,
            "pot": round((duel.stake or 0.0) * 2, 2),
        }
    )
    return data


# ─────────────────────────── Lectura (usuarios) ───────────────────────────
@router.get("/duels/available")
def available_duels(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Duelos abiertos por la comunidad (excluye los propios y los expirados)."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    all_open_duels = db.query(Duel).filter(Duel.status == DUEL_OPEN).all()
    for d in all_open_duels:
        if d.race_datetime and d.race_datetime <= now:
            creator = db.get(User, d.creator_id)
            if creator is not None:
                creator.balance = round((creator.balance or 0.0) + d.stake, 2)
            db.delete(d)
    db.commit()

    duels = (
        db.query(Duel)
        .filter(
            Duel.status == DUEL_OPEN,
            Duel.creator_id != user.id,
            Duel.race_datetime > now
        )
        .order_by(Duel.created_at.desc())
        .all()
    )
    return [_serialize(d, db) for d in duels]


@router.get("/duels/mine")
def my_duels(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Duelos donde el usuario es creador u oponente."""
    duels = (
        db.query(Duel)
        .filter((Duel.creator_id == user.id) | (Duel.acceptor_id == user.id))
        .order_by(Duel.created_at.desc())
        .all()
    )
    return [_serialize(d, db) for d in duels]


@router.get("/duels/{duel_id}")
def get_duel(
    duel_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    duel = db.get(Duel, duel_id)
    if duel is None:
        raise HTTPException(status_code=404, detail="Duelo no encontrado.")
    return _serialize(duel, db)


# ────────────────────────────── Crear duelo ──────────────────────────────
@router.post("/duels/create", status_code=201)
def create_duel(
    payload: DuelCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Publica un duelo: soporta tipos individuales, MARCAS y MOROCHA."""
    
    # ── Validación de estatus cerrado manualmente por el administrador ──
    entries = (
        db.query(RaceEntry)
        .filter(RaceEntry.race_number == payload.race_number)
        .order_by(RaceEntry.horse_number)
        .all()
    )
    if not entries:
        raise HTTPException(status_code=400, detail="Esa carrera no existe en la cartelera.")

    if any(getattr(e, "is_closed", False) for e in entries):
        raise HTTPException(
            status_code=400,
            detail=f"La Carrera {payload.race_number} está cerrada. No se pueden crear nuevos duelos."
        )

    duel_type = db.get(DuelType, payload.duel_type_id)
    if duel_type is None:
        raise HTTPException(status_code=404, detail="Tipo de duelo no encontrado.")

    is_morocha = getattr(duel_type, "is_morocha", False)
    is_matchup = getattr(duel_type, "is_matchup", False)

    if not is_matchup and not is_morocha:
        payload.horse_opponent = payload.horse_creator

    if is_morocha:
        if not (payload.horse_creator_2 and payload.horse_opponent_2):
            raise HTTPException(
                status_code=400,
                detail="Debes seleccionar los 4 caballos para la modalidad MOROCHA."
            )
        selected_horses = [
            payload.horse_creator,
            payload.horse_creator_2,
            payload.horse_opponent,
            payload.horse_opponent_2,
        ]
        if len(set(selected_horses)) < 4:
            raise HTTPException(
                status_code=400,
                detail="Los 4 caballos seleccionados para MOROCHA deben ser distintos entre sí."
            )
    elif is_matchup:
        if payload.horse_creator == payload.horse_opponent:
            raise HTTPException(status_code=400, detail="Los caballos deben ser distintos.")

    # ── Validación de cierre automático por horario (bloquea si la carrera ya inició) ──
    race_datetime = min(e.race_datetime for e in entries)
    if race_datetime.tzinfo is not None:
        race_datetime = race_datetime.astimezone(timezone.utc).replace(tzinfo=None)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if now >= race_datetime:
        raise HTTPException(
            status_code=400,
            detail=f"La carrera {payload.race_number} ya ha iniciado o finalizado. No se pueden crear nuevos duelos."
        )

    horses = {e.horse_number: e for e in entries}
    if payload.horse_creator not in horses:
        raise HTTPException(status_code=400, detail="El caballo elegido no corre en esa carrera.")
    if payload.horse_opponent not in horses:
        raise HTTPException(status_code=400, detail="El caballo rival no corre en esa carrera.")

    if is_morocha:
        if payload.horse_creator_2 not in horses:
            raise HTTPException(status_code=400, detail="El segundo caballo propio no corre en esa carrera.")
        if payload.horse_opponent_2 not in horses:
            raise HTTPException(status_code=400, detail="El segundo caballo rival no corre en esa carrera.")

    stake = round(float(payload.stake), 2)
    if stake <= 0:
        raise HTTPException(status_code=400, detail="El stake debe ser mayor que cero.")
    if (user.balance or 0.0) < stake:
        raise HTTPException(status_code=409, detail="Balance insuficiente para retener en escrow.")

    user.balance = round((user.balance or 0.0) - stake, 2)

    duel = Duel(
        duel_type_id=duel_type.id,
        race_number=payload.race_number,
        race_datetime=race_datetime,
        horse_creator=payload.horse_creator,
        horse_opponent=payload.horse_opponent,
        horse_creator_name=horses[payload.horse_creator].horse_name,
        horse_opponent_name=horses[payload.horse_opponent].horse_name,
        horse_creator_2=payload.horse_creator_2 if is_morocha else None,
        horse_opponent_2=payload.horse_opponent_2 if is_morocha else None,
        horse_creator_2_name=horses[payload.horse_creator_2].horse_name if is_morocha and payload.horse_creator_2 in horses else None,
        horse_opponent_2_name=horses[payload.horse_opponent_2].horse_name if is_morocha and payload.horse_opponent_2 in horses else None,
        horse_acceptor=None,
        stake=stake,
        fee_percentage=FEE_PERCENTAGE,
        status=DUEL_OPEN,
        creator_id=user.id,
    )
    db.add(duel)
    db.commit()
    db.refresh(duel)
    return _serialize(duel, db)


# ────────────────────────────── Aceptar duelo ──────────────────────────────
@router.post("/duels/{duel_id}/accept")
def accept_duel(
    duel_id: int,
    payload: Optional[DuelAccept] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    duel = db.get(Duel, duel_id)
    if duel is None:
        raise HTTPException(status_code=404, detail="Duelo no encontrado.")

    # ── Validación de estatus cerrado manualmente para la aceptación ──
    race_entries = (
        db.query(RaceEntry)
        .filter(RaceEntry.race_number == duel.race_number)
        .all()
    )
    if race_entries and any(getattr(e, "is_closed", False) for e in race_entries):
        raise HTTPException(
            status_code=400,
            detail=f"La Carrera {duel.race_number} está cerrada. No se pueden aceptar duelos."
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if duel.race_datetime and duel.race_datetime <= now:
        raise HTTPException(status_code=409, detail="El duelo ha expirado por tiempo de carrera.")
    if duel.status != DUEL_OPEN:
        raise HTTPException(status_code=409, detail="El duelo ya no está disponible.")
    if duel.creator_id == user.id:
        raise HTTPException(status_code=400, detail="No puedes aceptar tu propio duelo.")
    
    duel_type = db.get(DuelType, duel.duel_type_id)
    is_morocha = getattr(duel_type, "is_morocha", False)
    is_matchup = getattr(duel_type, "is_matchup", False)

    if (is_matchup or is_morocha) and payload is not None and payload.horse_acceptor is not None:
        if payload.horse_acceptor != duel.horse_opponent:
            raise HTTPException(
                status_code=400,
                detail="Debes tomar el caballo rival propuesto en el duelo.",
            )

    if (user.balance or 0.0) < duel.stake:
        raise HTTPException(status_code=409, detail="Balance insuficiente para igualar el stake.")

    user.balance = round((user.balance or 0.0) - duel.stake, 2)
    duel.acceptor_id = user.id
    duel.horse_acceptor = duel.horse_opponent
    duel.status = DUEL_ACTIVE
    duel.accepted_at = datetime.now()
    db.commit()
    db.refresh(duel)
    return _serialize(duel, db)


# ─────────────────────── Cancelar duelo (solo OPEN) ───────────────────────
@router.post("/duels/{duel_id}/cancel")
def cancel_duel(
    duel_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    duel = db.get(Duel, duel_id)
    if duel is None:
        raise HTTPException(status_code=404, detail="Duelo no encontrado.")
    if duel.status != DUEL_OPEN:
        raise HTTPException(status_code=409, detail="Solo se pueden cancelar duelos abiertos.")
    if duel.creator_id != user.id and user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Solo el creador puede cancelar este duelo.")

    creator = db.get(User, duel.creator_id)
    if creator is not None:
        creator.balance = round((creator.balance or 0.0) + duel.stake, 2)
    db.delete(duel)
    db.commit()
    return {"detail": "Duelo cancelado y stake reembolsado.", "id": duel_id}


# ─────────────────────── Panel Admin ───────────────────────
@router.get("/admin/duels")
def admin_duels(
    status: Optional[str] = Query(default=None, description="OPEN | ACTIVE | RESOLVED"),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    query = db.query(Duel)
    if status:
        query = query.filter(Duel.status == status.upper())
    duels = query.order_by(Duel.created_at.desc()).all()
    return [_serialize(d, db) for d in duels]


# ───────────────── Motor de resolución ─────────────────
def _resolve_refund(db: Session, duel: Duel, note: str) -> dict:
    creator = db.get(User, duel.creator_id)
    acceptor = db.get(User, duel.acceptor_id) if duel.acceptor_id else None
    if creator is not None:
        creator.balance = round((creator.balance or 0.0) + duel.stake, 2)
    if acceptor is not None:
        acceptor.balance = round((acceptor.balance or 0.0) + duel.stake, 2)

    duel.status = DUEL_RESOLVED
    duel.winner_id = None
    duel.winner_horse_number = None
    duel.commission_amount = 0.0
    duel.payout_amount = 0.0
    duel.resolution_note = note
    duel.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(duel)

    data = _serialize(duel, db)
    data.update({"pot": round(duel.stake * 2, 2), "commission": 0.0, "payout": 0.0, "refund": True})
    return data


def _resolve_payout(db: Session, duel: Duel, winner_horse: int, note: str, force_acceptor_win: bool = False) -> dict:
    winner_user_id = duel.acceptor_id if force_acceptor_win else (duel.creator_id if winner_horse == duel.horse_creator else duel.acceptor_id)
    if winner_user_id is None:
        raise HTTPException(status_code=409, detail="El duelo no tiene oponente registrado.")

    fee_percentage = duel.fee_percentage if duel.fee_percentage is not None else FEE_PERCENTAGE
    pot = round((duel.stake or 0.0) * 2, 2)
    commission = round(pot * fee_percentage, 2)
    payout = round(pot - commission, 2)

    winner_user = db.get(User, winner_user_id)
    if winner_user is None:
        raise HTTPException(status_code=404, detail="Usuario ganador no encontrado.")
    winner_user.balance = round((winner_user.balance or 0.0) + payout, 2)

    duel.status = DUEL_RESOLVED
    duel.winner_id = winner_user_id
    duel.winner_horse_number = winner_horse
    duel.commission_amount = commission
    duel.payout_amount = payout
    duel.resolution_note = note
    duel.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(duel)

    data = _serialize(duel, db)
    data.update(
        {
            "pot": pot,
            "commission": commission,
            "commission_percentage": fee_percentage,
            "payout": payout,
        }
    )
    return data


def resolve_duel_core(
    db: Session,
    duel: Duel,
    requested: Optional[int] = None,
    note: Optional[str] = None,
) -> dict:
    """Lógica de resolución general y unificada."""
    if duel.status != DUEL_ACTIVE:
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden resolver duelos ACTIVOS (aceptados por un oponente).",
        )

    duel_type = db.get(DuelType, duel.duel_type_id)
    rule = (duel_type.logic_rule if duel_type else "MANUAL").strip().upper()
    horses = (duel.horse_creator, duel.horse_opponent)
    positions = get_official_positions(db, duel.race_number)

    if rule == RULE_TIE:
        return _resolve_refund(
            db, duel, note or "Empate: reembolso total del escrow a ambos participantes."
        )

    if rule == RULE_OFFICIAL:
        if not positions:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"La carrera {duel.race_number} no tiene posiciones oficiales (1° al 5°). "
                    "Regístralas en «Resultados oficiales» antes de resolver."
                ),
            )
        
        is_morocha = getattr(duel_type, "is_morocha", False)
        is_matchup = getattr(duel_type, "is_matchup", False)

        # ── CASO GENERAL: Duelos donde el resultado depende de UN SOLO EJEMPLAR ──
        if not is_matchup and not is_morocha:
            target_horse = duel.horse_creator
            pos_target = positions.get(target_horse) if positions else None
            duel_type_name = (duel_type.name if duel_type else "").upper()

            creator_wins = False
            if "PELO A PELO" in duel_type_name:
                creator_wins = (pos_target == 1)
            elif "2 PUESTOS" in duel_type_name:
                creator_wins = (pos_target is not None and pos_target <= 2)
            elif "3 PUESTOS" in duel_type_name:
                creator_wins = (pos_target is not None and pos_target <= 3)
            elif "4 PUESTOS" in duel_type_name:
                creator_wins = (pos_target is not None and pos_target <= 4)
            elif "5 PUESTOS" in duel_type_name:
                creator_wins = (pos_target is not None and pos_target <= 5)
            else:
                creator_wins = (pos_target == 1)

            if creator_wins:
                winner_horse = target_horse
                pos_str = f"{pos_target}.º" if pos_target else "1.º"
                outcome_note = note or f"Marcador oficial: N.º {target_horse} llegó {pos_str} — Cumple la condición (Gana el Creador)."
                return _resolve_payout(db, duel, winner_horse, outcome_note)
            else:
                pos_str = f"{pos_target}.º" if pos_target else "fuera del top 5"
                outcome_note = note or f"Marcador oficial: N.º {target_horse} llegó {pos_str} — No cumple la condición (Gana el Aceptador)."
                return _resolve_payout(db, duel, target_horse, outcome_note, force_acceptor_win=True)

        # ── CASO MARCAS / ENFRENTAMIENTOS (2 caballos distintos) ──
        winner_horse, outcome_note = official_outcome(
            positions, duel.horse_creator, duel.horse_opponent
        )
        if winner_horse is None:
            if requested is not None and requested in horses:
                winner_horse = requested
                outcome_note = note or "Sobreescrito por admin debido a falta de marcador oficial"
            else:
                return _resolve_refund(db, duel, outcome_note)
        if requested is not None and requested != winner_horse:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El marcador oficial indica que gana el caballo N.º {winner_horse}; "
                    f"no coincide con el indicado (N.º {requested})."
                ),
            )
        return _resolve_payout(db, duel, winner_horse, note or outcome_note)

    if rule == RULE_LOWEST:
        winner_horse = min(horses)
    elif rule == RULE_HIGHEST:
        winner_horse = max(horses)
    else:
        if positions:
            official_winner, outcome_note = official_outcome(
                positions, duel.horse_creator, duel.horse_opponent
            )
            if official_winner is None:
                if requested is not None and requested in horses:
                    winner_horse = requested
                    outcome_note = note or "Sobreescrito por admin debido a falta de marcador oficial"
                else:
                    return _resolve_refund(db, duel, outcome_note)
            else:
                winner_horse = official_winner
                note = note or outcome_note
                if requested is not None and requested != winner_horse:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"El marcador oficial indica que gana el caballo N.º {winner_horse} "
                            f"— {outcome_note} Tu selección (N.º {requested}) no coincide."
                        ),
                    )
        else:
            if requested is None:
                raise HTTPException(
                    status_code=400,
                    detail="Esta regla requiere indicar winner_horse_number.",
                )
            winner_horse = requested

    if winner_horse not in horses:
        raise HTTPException(
            status_code=400,
            detail="El caballo ganador debe ser uno de los dos en pugna en este duelo.",
        )
    if rule in (RULE_LOWEST, RULE_HIGHEST) and requested is not None and requested != winner_horse:
        raise HTTPException(
            status_code=400,
            detail=(
                f"La regla {rule} determina que gana el caballo N.º {winner_horse}; "
                f"no coincide con el indicado (N.º {requested})."
            ),
        )

    return _resolve_payout(db, duel, winner_horse, note or f"Regla aplicada: {rule}.")


@router.post("/admin/duels/{duel_id}/resolve")
def resolve_duel(
    duel_id: int,
    payload: Optional[ResolveDuel] = None,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Resuelve un duelo ACTIVO."""
    duel = db.get(Duel, duel_id)
    if duel is None:
        raise HTTPException(status_code=404, detail="Duelo no encontrado.")
    requested = payload.winner_horse_number if payload else None
    note = payload.note.strip() if payload and payload.note else None
    return resolve_duel_core(db, duel, requested, note)