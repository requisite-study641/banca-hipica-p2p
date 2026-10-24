"""
Banca Hípica P2P — aplicación FastAPI (punto de entrada).

Ejecutar desde la RAÍZ del proyecto:
    uvicorn backend.main:app --reload

Sirve la API JSON bajo /... y el frontend móvil estático en la raíz (/).
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import database
from .routers import audit, auth, duel_types, payments, races, duels

app = FastAPI(
    title="Banca Hípica P2P",
    description=(
        "Aplicación web móvil modular de apuestas P2P en carreras de caballos. "
        "Comisión fija del 5% para la casa, escrow por duelo y resolución "
        "exclusiva del administrador."
    ),
    version="1.0.0",
)

# Permite probar la API desde otros orígenes (Swagger u otros frontends).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Crea tablas y siembra datos iniciales (admin + tipos de duelo + banco)."""
    database.seed_initial_data()


# ─────────────────────────── Routers de la API ───────────────────────────
app.include_router(auth.router)
app.include_router(duel_types.router)
app.include_router(races.router)
app.include_router(duels.router)
app.include_router(payments.router)
app.include_router(audit.router)


@app.get("/health", tags=["system"])
def health():
    """Sonda de estado del servicio."""
    return {"status": "ok", "app": "banca-hipica-p2p", "fee_percentage": 0.05}


# ─────────────────────── Frontend móvil (estático) ───────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")