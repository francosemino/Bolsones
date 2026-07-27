"""BolsonesControl - FastAPI server.

Single-file routing for: auth, products, suppliers, purchases, bag types, bags,
sales, orders, customers, cash, expenses, employees, waste, reports,
business config and public endpoints.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, WebSocket, WebSocketDisconnect, Body, Header
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from models import (
    Product, StockMovement, Supplier, Purchase, PurchaseItem,
    BagType, Bag, IngredientUsed, Customer, Sale, SaleItem,
    Order, OrderItem, CashSession, CashMovement, Expense, Employee,
    Waste, BusinessConfig, User, UserCreate, UserLogin, now_iso, new_id,
    SalesStation, Ticket, TicketItem, PriceHistory, Reclassification, CrateType,
    Attendance, PayrollPayment,
)
from auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    get_token_from_request, decode_token,
)
from seed import seed_demo_data
from migrations import run_all as run_migrations

import jwt as pyjwt

# ============================================================
# Setup
# ============================================================
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ENVIRONMENT: "development" (default) habilita datos/usuarios demo y admin123
# por defecto. En "production" (el local del cliente) se exige config explícita.
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"

app = FastAPI(title="BolsonesControl API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bolsones")


# ============================================================
# Auth dependency
# ============================================================
async def current_user(request: Request) -> dict:
    token = get_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def require(*roles: str):
    async def _dep(user: dict = Depends(current_user)) -> dict:
        if user.get("role") == "admin" or user.get("role") in roles:
            return user
        raise HTTPException(status_code=403, detail="Sin permisos para esta acción")
    return _dep

# Permisos disponibles: "ventas", "stock", "bolsones", "perdidas", "pedidos",
# "reportes", "empleados", "config". "admin" siempre tiene todo, sin importar
# la lista de permisos — así el dueño principal nunca queda afuera por error.
def require_perm(*perms: str):
    async def _dep(user: dict = Depends(current_user)) -> dict:
        if user.get("role") == "admin":
            return user
        user_perms = set(user.get("permissions") or [])
        if user_perms.intersection(perms):
            return user
        raise HTTPException(status_code=403, detail="Sin permisos para esta acción")
    return _dep

# ============================================================
# Helpers
# ============================================================
def clean(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


async def next_counter(name: str) -> int:
    res = await db.counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    if not res:
        await db.counters.insert_one({"_id": name, "seq": 1})
        return 1
    return res.get("seq", 1)


async def add_stock_movement(product_id: str, mtype: str, qty: float, unit: str,
                             cost: Optional[float] = None, reason: Optional[str] = None,
                             user: Optional[dict] = None, ref_id: Optional[str] = None,
                             notes: Optional[str] = None):
    prod = await db.products.find_one({"id": product_id}, {"_id": 0})
    name = prod["name"] if prod else None
    mv = StockMovement(
        product_id=product_id,
        product_name=name,
        type=mtype,
        quantity=qty,
        unit=unit,
        cost=cost,
        reason=reason,
        user_id=user["id"] if user else None,
        user_name=user["name"] if user else None,
        reference_id=ref_id,
        notes=notes,
    )
    await db.stock_movements.insert_one(mv.model_dump())


# ============================================================
# Health
# ============================================================
@api.get("/")
async def root():
    return {"app": "BolsonesControl", "ok": True}


# ============================================================
# AUTH
# ============================================================

@api.post("/admin/bootstrap")
async def admin_bootstrap(payload: dict, x_bootstrap_secret: str = Header(None)):
    """Endpoint de emergencia: crea o resetea un usuario admin en cualquier
    momento, sin depender del arranque del server. Protegido por un secreto
    aparte (BOOTSTRAP_SECRET) que no es la contraseña del admin."""
    secret = os.environ.get("BOOTSTRAP_SECRET")
    if not secret or x_bootstrap_secret != secret:
        raise HTTPException(status_code=403, detail="No autorizado")
    email = payload.get("email", "").lower().strip()
    password = payload.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Faltan email o password")
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one({"email": email}, {"$set": {
            "password_hash": hash_password(password), "role": "admin", "active": True,
        }})
        return {"ok": True, "action": "actualizado", "email": email}
    else:
        u = User(email=email, name="Administrador", role="admin").model_dump()
        u["password_hash"] = hash_password(password)
        await db.users.insert_one(u)
        return {"ok": True, "action": "creado", "email": email}


@api.post("/auth/login")
async def login(payload: UserLogin, response: Response):
    identifier = payload.identifier.lower().strip()
    user = await db.users.find_one({"$or": [{"username": identifier}, {"email": identifier}]})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Usuario inactivo")
    access = create_access_token(user["id"], user["username"], user.get("role", "cajero"))
    refresh = create_refresh_token(user["id"])
    response.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=16*3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False, samesite="lax", max_age=14*24*3600, path="/")
    safe = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return {"user": safe, "access_token": access}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


@api.get("/auth/users")
async def list_users(user: dict = Depends(require_perm("config"))):
    cursor = db.users.find({}, {"_id": 0, "password_hash": 0})
    return [u async for u in cursor]


@api.post("/auth/users")
async def create_user(payload: UserCreate, user: dict = Depends(require_perm("config"))):
    username = payload.username.lower().strip()
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Ese nombre de usuario ya existe")
    email = payload.email.lower().strip() if payload.email else None
    if email and await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Ese email ya está en uso")
    u = User(username=username, email=email, name=payload.name, role=payload.role,
             phone=payload.phone, permissions=payload.permissions)
    doc = u.model_dump()
    doc["password_hash"] = hash_password(payload.password)
    await db.users.insert_one(doc)
    return u.model_dump()


@api.patch("/auth/users/{user_id}")
async def update_user(user_id: str, payload: dict, user: dict = Depends(require_perm("config"))):
    update = {k: v for k, v in payload.items()
              if k in ("name", "role", "phone", "active", "permissions", "username", "email")}
    if update.get("username"):
        update["username"] = update["username"].lower().strip()
        clash = await db.users.find_one({"username": update["username"], "id": {"$ne": user_id}})
        if clash:
            raise HTTPException(status_code=400, detail="Ese nombre de usuario ya existe")
    if "email" in update and update["email"]:
        update["email"] = update["email"].lower().strip()
        clash = await db.users.find_one({"email": update["email"], "id": {"$ne": user_id}})
        if clash:
            raise HTTPException(status_code=400, detail="Ese email ya está en uso")
    if "password" in payload and payload["password"]:
        update["password_hash"] = hash_password(payload["password"])
    if update:
        await db.users.update_one({"id": user_id}, {"$set": update})
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return u


# ============================================================
# PRODUCTS
# ============================================================
@api.get("/products")
async def list_products(category: Optional[str] = None, search: Optional[str] = None,
                        active_only: bool = False, user: dict = Depends(current_user)):
    q = {}
    if category and category != "all":
        q["category"] = category
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    if active_only:
        q["active"] = True
    cursor = db.products.find(q, {"_id": 0}).sort("name", 1)
    return [p async for p in cursor]


@api.get("/products/{product_id}")
async def get_product(product_id: str, user: dict = Depends(current_user)):
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return p


@api.post("/products")
async def create_product(payload: Product, user: dict = Depends(require_perm("stock"))):
    payload.id = new_id()
    await db.products.insert_one(payload.model_dump())
    return payload.model_dump()


class BulkPriceItem(BaseModel):
    id: str
    sale_price: float


@api.patch("/products/bulk-prices")
async def bulk_update_prices(payload: List[BulkPriceItem] = Body(...),
                             user: dict = Depends(require_perm("stock"))):
    updated = 0
    for it in payload:
        prod = await db.products.find_one({"id": it.id}, {"_id": 0})
        if not prod:
            continue
        old = float(prod.get("sale_price", 0))
        new = float(it.sale_price)
        if abs(old - new) < 0.01:
            continue
        await db.products.update_one({"id": it.id}, {"$set": {"sale_price": new}})
        hist = PriceHistory(
            product_id=it.id, product_name=prod["name"],
            old_price=old, new_price=new,
            user_id=user["id"], user_name=user["name"],
        )
        await db.price_history.insert_one(hist.model_dump())
        updated += 1
    return {"updated": updated}


@api.patch("/products/{product_id}")
async def update_product(product_id: str, payload: dict, user: dict = Depends(require_perm("stock"))):
    payload.pop("id", None)
    await db.products.update_one({"id": product_id}, {"$set": payload})
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_perm("stock"))):
    await db.products.update_one({"id": product_id}, {"$set": {"active": False}})
    return {"ok": True}


@api.post("/products/{product_id}/adjust")
async def adjust_product_stock(product_id: str, payload: dict, user: dict = Depends(require_perm("stock"))):
    delta = float(payload.get("delta", 0))
    reason = payload.get("reason", "Ajuste manual")
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    new_stock = max(0, float(p.get("current_stock", 0)) + delta)
    await db.products.update_one({"id": product_id}, {"$set": {"current_stock": new_stock}})
    await add_stock_movement(product_id, "ajuste", delta, p.get("unit", "kg"), reason=reason, user=user)
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api.get("/products/{product_id}/movements")
async def product_movements(product_id: str, user: dict = Depends(current_user)):
    cursor = db.stock_movements.find({"product_id": product_id}, {"_id": 0}).sort("created_at", -1).limit(200)
    return [m async for m in cursor]


@api.get("/stock-movements")
async def all_movements(limit: int = 200, user: dict = Depends(current_user)):
    cursor = db.stock_movements.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [m async for m in cursor]


# ============================================================
# SUPPLIERS
# ============================================================
@api.get("/suppliers")
async def list_suppliers(user: dict = Depends(current_user)):
    cursor = db.suppliers.find({}, {"_id": 0}).sort("name", 1)
    return [s async for s in cursor]


@api.post("/suppliers")
async def create_supplier(payload: Supplier, user: dict = Depends(require_perm("stock"))):
    payload.id = new_id()
    await db.suppliers.insert_one(payload.model_dump())
    return payload.model_dump()


@api.patch("/suppliers/{sid}")
async def update_supplier(sid: str, payload: dict, user: dict = Depends(require_perm("stock"))):
    payload.pop("id", None)
    await db.suppliers.update_one({"id": sid}, {"$set": payload})
    return await db.suppliers.find_one({"id": sid}, {"_id": 0})


@api.delete("/suppliers/{sid}")
async def delete_supplier(sid: str, user: dict = Depends(require_perm("stock"))):
    await db.suppliers.update_one({"id": sid}, {"$set": {"active": False}})
    return {"ok": True}


# ============================================================
# PURCHASES
# ============================================================

# ============================================================
# CRATE TYPES (tipos de cajón del mercado central, con su tara)
# ============================================================
@api.get("/crate-types")
async def list_crate_types(active_only: bool = False, user: dict = Depends(current_user)):
    q = {"active": True} if active_only else {}
    cursor = db.crate_types.find(q, {"_id": 0}).sort("name", 1)
    return [c async for c in cursor]


@api.post("/crate-types")
async def create_crate_type(payload: CrateType, user: dict = Depends(require_perm("stock"))):
    payload.id = new_id()
    await db.crate_types.insert_one(payload.model_dump())
    return payload.model_dump()


@api.patch("/crate-types/{cid}")
async def update_crate_type(cid: str, payload: dict, user: dict = Depends(require_perm("stock"))):
    payload.pop("id", None)
    await db.crate_types.update_one({"id": cid}, {"$set": payload})
    updated = await db.crate_types.find_one({"id": cid}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Tipo de cajón no encontrado")
    return updated


@api.get("/purchases")
async def list_purchases(user: dict = Depends(current_user)):
    cursor = db.purchases.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    return [p async for p in cursor]


@api.post("/purchases")
async def create_purchase(payload: Purchase, user: dict = Depends(require_perm("stock"))):
    payload.id = new_id()
    payload.user_id = user["id"]
    # Fill supplier name
    if payload.supplier_id:
        sup = await db.suppliers.find_one({"id": payload.supplier_id}, {"_id": 0})
        if sup:
            payload.supplier_name = sup["name"]
    # Update stock for each item
    total = 0.0
    for item in payload.items:
        prod = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        if not prod:
            continue
        item.product_name = prod["name"]
        # Update average cost (weighted)
        prev_stock = float(prod.get("current_stock", 0))
        prev_cost = float(prod.get("average_cost", 0))
        added = float(item.kg_equivalent)
        cost_per_kg = float(item.total_cost) / added if added > 0 else 0
        new_stock = prev_stock + added
        if new_stock > 0:
            new_avg = ((prev_stock * prev_cost) + (added * cost_per_kg)) / new_stock
        else:
            new_avg = prev_cost
        await db.products.update_one(
            {"id": item.product_id},
            {"$set": {
                "current_stock": new_stock,
                "average_cost": round(new_avg, 2),
                "last_purchase_at": now_iso(),
                "supplier_id": payload.supplier_id or prod.get("supplier_id"),
            }},
        )
        await add_stock_movement(item.product_id, "entrada", added, prod.get("unit", "kg"),
                                 cost=item.total_cost, reason=f"Compra a {payload.supplier_name or 'proveedor'}",
                                 user=user, ref_id=payload.id)
        total += float(item.total_cost)
    payload.total = round(total, 2)
    if payload.payment_status == "pagado":
        payload.paid_amount = payload.total
    await db.purchases.insert_one(payload.model_dump())
    return payload.model_dump()


# ============================================================
# BAG TYPES
# ============================================================
@api.get("/bag-types")
async def list_bag_types(active_only: bool = False, user: dict = Depends(current_user)):
    q = {"active": True} if active_only else {}
    cursor = db.bag_types.find(q, {"_id": 0}).sort("name", 1)
    return [b async for b in cursor]


@api.post("/bag-types")
async def create_bag_type(payload: BagType, user: dict = Depends(require_perm("bolsones"))):
    payload.id = new_id()
    # Fill product names in recipe
    for r in payload.recipe:
        prod = await db.products.find_one({"id": r.product_id}, {"_id": 0})
        if prod:
            r.product_name = prod["name"]
    await db.bag_types.insert_one(payload.model_dump())
    return payload.model_dump()


@api.patch("/bag-types/{bid}")
async def update_bag_type(bid: str, payload: dict, user: dict = Depends(require_perm("bolsones"))):
    payload.pop("id", None)
    if "recipe" in payload:
        for r in payload["recipe"]:
            prod = await db.products.find_one({"id": r["product_id"]}, {"_id": 0})
            if prod:
                r["product_name"] = prod["name"]
    await db.bag_types.update_one({"id": bid}, {"$set": payload})
    return await db.bag_types.find_one({"id": bid}, {"_id": 0})


@api.delete("/bag-types/{bid}")
async def delete_bag_type(bid: str, user: dict = Depends(require_perm("bolsones"))):
    await db.bag_types.update_one({"id": bid}, {"$set": {"active": False}})
    return {"ok": True}


# ============================================================
# BAGS (armed)
# ============================================================
@api.get("/bags")
async def list_bags(status: Optional[str] = None, search: Optional[str] = None,
                    user: dict = Depends(current_user)):
    q = {}
    if status and status != "all":
        q["status"] = status
    if search:
        q["$or"] = [
            {"code": {"$regex": search, "$options": "i"}},
            {"bag_type_name": {"$regex": search, "$options": "i"}},
        ]
    cursor = db.bags.find(q, {"_id": 0}).sort("created_at", -1).limit(500)
    return [b async for b in cursor]


@api.get("/bags/by-code/{code}")
async def bag_by_code(code: str, user: dict = Depends(current_user)):
    b = await db.bags.find_one({"code": code.upper()}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bolsón no encontrado")
    return b


@api.get("/bags/{bag_id}")
async def get_bag(bag_id: str, user: dict = Depends(current_user)):
    b = await db.bags.find_one({"id": bag_id}, {"_id": 0})
    if not b:
        b = await db.bags.find_one({"code": bag_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bolsón no encontrado")
    return b


class BagBuildPayload(BaseModel):
    bag_type_id: str
    weight_kg: float
    ingredients_used: List[IngredientUsed] = []
    notes: Optional[str] = None
    override_price: Optional[float] = None


@api.post("/bags/build")
async def build_bag(payload: BagBuildPayload, user: dict = Depends(require_perm("bolsones"))):
    bt = await db.bag_types.find_one({"id": payload.bag_type_id}, {"_id": 0})
    if not bt:
        raise HTTPException(status_code=404, detail="Tipo de bolsón no encontrado")

    # Validate stock + compute cost
    estimated_cost = 0.0
    for ing in payload.ingredients_used:
        prod = await db.products.find_one({"id": ing.product_id}, {"_id": 0})
        if not prod:
            raise HTTPException(status_code=400, detail=f"Producto {ing.product_name} no encontrado")
        if float(prod.get("current_stock", 0)) < ing.quantity:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente de {prod['name']}")
        ing.product_name = prod["name"]
        ing.cost = round(float(prod.get("average_cost", 0)) * ing.quantity, 2)
        estimated_cost += ing.cost

    # Discount stock
    for ing in payload.ingredients_used:
        await db.products.update_one(
            {"id": ing.product_id},
            {"$inc": {"current_stock": -ing.quantity}},
        )
        await add_stock_movement(ing.product_id, "armado", -ing.quantity, ing.unit,
                                 cost=ing.cost, reason=f"Armado bolsón {bt['name']}",
                                 user=user)

    # Price
    if payload.override_price is not None:
        price = float(payload.override_price)
    elif bt.get("pricing_mode") == "per_kg":
        price = round(float(bt.get("price_per_kg", 0)) * payload.weight_kg, 2)
    else:
        price = float(bt.get("fixed_price", 0))

    seq = await next_counter("bag")
    code = f"BOL-{seq:06d}"

    bag = Bag(
        code=code,
        bag_type_id=bt["id"],
        bag_type_name=bt["name"],
        weight_kg=payload.weight_kg,
        final_price=price,
        estimated_cost=round(estimated_cost, 2),
        estimated_margin=round(price - estimated_cost, 2),
        status="disponible",
        ingredients_used=payload.ingredients_used,
        notes=payload.notes,
        created_by=user["id"],
        created_by_name=user["name"],
    )
    await db.bags.insert_one(bag.model_dump())
    return bag.model_dump()


@api.patch("/bags/{bag_id}")
async def update_bag(bag_id: str, payload: dict, user: dict = Depends(require_perm("bolsones"))):
    payload.pop("id", None)
    payload.pop("code", None)
    await db.bags.update_one({"id": bag_id}, {"$set": payload})
    return await db.bags.find_one({"id": bag_id}, {"_id": 0})


@api.post("/bags/{bag_id}/discard")
async def discard_bag(bag_id: str, payload: dict = None, user: dict = Depends(require_perm("bolsones"))):
    b = await db.bags.find_one({"id": bag_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bolsón no encontrado")
    await db.bags.update_one({"id": bag_id}, {"$set": {"status": "descartado"}})
    reason = (payload or {}).get("reason", "Descarte de bolsón")
    # Optional: register waste for ingredients
    for ing in b.get("ingredients_used", []):
        await db.waste.insert_one(Waste(
            product_id=ing["product_id"],
            product_name=ing["product_name"],
            quantity=ing["quantity"],
            unit=ing.get("unit", "kg"),
            reason="otro",
            estimated_cost=ing.get("cost", 0),
            user_name=user["name"],
            notes=f"Bolsón {b['code']} descartado: {reason}",
        ).model_dump())
    return {"ok": True}


# ============================================================
# CUSTOMERS
# ============================================================
@api.get("/customers")
async def list_customers(search: Optional[str] = None, user: dict = Depends(current_user)):
    q = {}
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    cursor = db.customers.find(q, {"_id": 0}).sort("name", 1)
    return [c async for c in cursor]


@api.post("/customers")
async def create_customer(payload: Customer, user: dict = Depends(current_user)):
    payload.id = new_id()
    await db.customers.insert_one(payload.model_dump())
    return payload.model_dump()


@api.patch("/customers/{cid}")
async def update_customer(cid: str, payload: dict, user: dict = Depends(current_user)):
    payload.pop("id", None)
    await db.customers.update_one({"id": cid}, {"$set": payload})
    return await db.customers.find_one({"id": cid}, {"_id": 0})


@api.delete("/customers/{cid}")
async def delete_customer(cid: str, user: dict = Depends(require_perm("ventas"))):
    await db.customers.update_one({"id": cid}, {"$set": {"active": False}})
    return {"ok": True}


@api.get("/customers/{cid}/sales")
async def customer_sales(cid: str, user: dict = Depends(current_user)):
    cursor = db.sales.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).limit(200)
    return [s async for s in cursor]


# ============================================================
# SALES (POS)
# ============================================================
class SaleCreate(BaseModel):
    items: List[SaleItem]
    discount: float = 0
    payment_method: str = "efectivo"
    mixed_payments: Optional[List[dict]] = None
    customer_id: Optional[str] = None
    notes: Optional[str] = None


@api.get("/sales")
async def list_sales(limit: int = 200, user: dict = Depends(current_user)):
    cursor = db.sales.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [s async for s in cursor]


@api.post("/sales")
async def create_sale(payload: SaleCreate, user: dict = Depends(require_perm("ventas"))):
    subtotal = 0.0
    for it in payload.items:
        subtotal += float(it.subtotal)
    total = round(subtotal - float(payload.discount or 0), 2)
    customer_name = None
    if payload.customer_id:
        cust = await db.customers.find_one({"id": payload.customer_id}, {"_id": 0})
        if cust:
            customer_name = cust["name"]

    # Find current open cash session — es obligatoria para poder cobrar
    session = await db.cash_sessions.find_one({"status": "abierta"}, {"_id": 0}, sort=[("opened_at", -1)])
    if not session:
        raise HTTPException(status_code=400, detail="No hay caja abierta. Abrí la caja antes de cobrar.")

    sale = Sale(
        items=payload.items,
        subtotal=round(subtotal, 2),
        discount=float(payload.discount or 0),
        total=total,
        payment_method=payload.payment_method,
        mixed_payments=payload.mixed_payments,
        customer_id=payload.customer_id,
        customer_name=customer_name,
        user_id=user["id"],
        user_name=user["name"],
        cash_session_id=session["id"] if session else None,
        notes=payload.notes,
    )

    # Process each item de forma ATÓMICA y CONDICIONAL (sin condiciones de carrera).
    # Si algún ítem falla, se revierte TODO lo aplicado en esta venta.
    stock_aplicado = []      # [(product_id, qty)] ya descontados
    bolsones_aplicados = []  # [bag_id] ya marcados vendidos

    async def _revertir():
        for pid, q in stock_aplicado:
            await db.products.update_one({"id": pid}, {"$inc": {"current_stock": q}})
        for bid in bolsones_aplicados:
            await db.bags.update_one({"id": bid}, {
                "$set": {"status": "disponible"},
                "$unset": {"sold_at": "", "sale_id": ""},
            })

    for it in payload.items:
        if it.type == "bag":
            b = await db.bags.find_one({"id": it.ref_id}, {"_id": 0})
            if not b:
                b = await db.bags.find_one({"code": it.ref_id}, {"_id": 0})
            if not b:
                await _revertir()
                raise HTTPException(status_code=404, detail=f"Bolsón {it.ref_id} no encontrado")
            res = await db.bags.update_one(
                {"id": b["id"], "status": "disponible"},
                {"$set": {"status": "vendido", "sold_at": now_iso(), "sale_id": sale.id}},
            )
            if res.modified_count == 0:
                await _revertir()
                raise HTTPException(status_code=400, detail=f"Bolsón {b['code']} ya no está disponible")
            bolsones_aplicados.append(b["id"])
        elif it.type == "product":
            prod = await db.products.find_one({"id": it.ref_id}, {"_id": 0})
            if not prod:
                await _revertir()
                raise HTTPException(status_code=404, detail=f"Producto no encontrado")
            qty = float(it.quantity)
            res = await db.products.update_one(
                {"id": it.ref_id, "current_stock": {"$gte": qty}},
                {"$inc": {"current_stock": -qty}},
            )
            if res.modified_count == 0:
                await _revertir()
                raise HTTPException(status_code=400,
                                    detail=f"Stock insuficiente de {prod['name']} (hay {prod.get('current_stock', 0)} {prod.get('unit','kg')})")
            stock_aplicado.append((it.ref_id, qty))
            await add_stock_movement(it.ref_id, "salida", -qty, it.unit or prod.get("unit", "kg"),
                                     reason="Venta", user=user, ref_id=sale.id)

    await db.sales.insert_one(sale.model_dump())

    # Update customer aggregates
    if payload.customer_id:
        await db.customers.update_one(
            {"id": payload.customer_id},
            {"$inc": {"total_spent": total}, "$set": {"last_purchase_at": now_iso()}},
        )

    # Add to cash session
    if session:
        movement = CashMovement(
            type="venta",
            amount=total,
            method=payload.payment_method,
            description=f"Venta #{sale.id[:8]}",
            reference_id=sale.id,
        )
        await db.cash_sessions.update_one(
            {"id": session["id"]},
            {"$push": {"movements": movement.model_dump()},
             "$inc": {f"sales_by_method.{payload.payment_method}": total}},
        )

    return sale.model_dump()


# ============================================================
# ORDERS — reglas de negocio: días de reparto, mínimo de compra, avisos
# ============================================================
DELIVERY_WEEKDAYS = (1, 3)  # lunes=0 ... martes=1, jueves=3
ORDER_CUTOFF_HOUR = 22  # corte: 22hs del día anterior al reparto


def _next_valid_delivery_dates(count: int = 6) -> List[str]:
    """Próximas fechas de entrega válidas (martes/jueves) que todavía están
    dentro del horario de corte (hasta las 22hs del día anterior)."""
    now = datetime.now(timezone.utc)
    dates = []
    d = now.date()
    for _ in range(30):  # margen amplio de búsqueda, nunca debería hacer falta tanto
        if d.weekday() in DELIVERY_WEEKDAYS:
            cutoff_day = d - timedelta(days=1)
            cutoff = datetime(cutoff_day.year, cutoff_day.month, cutoff_day.day,
                              ORDER_CUTOFF_HOUR, 0, 0, tzinfo=timezone.utc)
            if now <= cutoff:
                dates.append(d.isoformat())
                if len(dates) >= count:
                    break
        d += timedelta(days=1)
    return dates


def _validate_delivery_date(date_str: Optional[str]):
    if not date_str:
        raise HTTPException(status_code=400, detail="Elegí una fecha de entrega")
    only_date = date_str[:10]
    if only_date not in _next_valid_delivery_dates(10):
        raise HTTPException(
            status_code=400,
            detail="Esa fecha ya no está disponible (se reparte martes y jueves, con corte a "
                   "las 22hs del día anterior). Elegí otra fecha."
        )


def _validate_order_minimum(items: list):
    """El mínimo de 9 productos o 9 kilos aplica solo a pedidos 'a elección'
    (productos sueltos). Los pedidos de solo bolsones armados no tienen mínimo."""
    product_items = [it for it in items if it.type == "product"]
    if not product_items:
        return
    total_kg = sum(it.quantity for it in product_items if (it.unit or "").lower() == "kg")
    total_units = sum(it.quantity for it in product_items if (it.unit or "").lower() != "kg")
    if total_kg < 9 and total_units < 9:
        raise HTTPException(
            status_code=400,
            detail=f"El pedido a elección tiene un mínimo de 9 productos o 9 kilos "
                   f"(llevás {total_units:.0f} productos / {total_kg:.1f}kg)."
        )


async def _notify_owner_new_order(order: Order):
    """Avisa por mail al dueño de un pedido nuevo. Nunca bloquea la creación
    del pedido si el envío falla — solo queda registrado en el log."""
    cfg = await db.business_config.find_one({"id": "main"}, {"_id": 0})
    to_email = (cfg or {}).get("email")
    smtp_host = os.environ.get("SMTP_HOST")
    if not to_email or not smtp_host:
        logger.warning("Aviso de pedido nuevo omitido: falta email de destino o SMTP_HOST")
        return
    try:
        import smtplib
        from email.mime.text import MIMEText

        body = (
            f"Nuevo pedido {order.code} de {order.customer_name} "
            f"({order.customer_phone or 'sin teléfono'}).\n"
            f"Total: ${order.total:.2f}\n"
            f"Entrega: {order.delivery_type} · {order.scheduled_date or 'sin fecha'}\n"
            f"Pago: {order.payment_method}\n"
            f"Items: {len(order.items)}\n"
        )
        msg = MIMEText(body)
        msg["Subject"] = f"Nuevo pedido {order.code}"
        msg["From"] = os.environ.get("SMTP_FROM", os.environ.get("SMTP_USER", "no-reply@bolsones.com"))
        msg["To"] = to_email

        smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        smtp_user = os.environ.get("SMTP_USER")
        smtp_pass = os.environ.get("SMTP_PASSWORD")
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as smtp:
            smtp.starttls()
            if smtp_user and smtp_pass:
                smtp.login(smtp_user, smtp_pass)
            smtp.send_message(msg)
    except Exception as e:
        logger.error(f"No se pudo enviar el mail de aviso de pedido nuevo: {e}")
        
        
def _normalize_ar_whatsapp_number(phone: str) -> str:
    """WhatsApp exige el formato E.164. Para celulares de Argentina hace falta
    anteponer un '9' (ej: +54 9 11 xxxx-xxxx), sea que el cliente haya
    tipeado el número con o sin el código de país."""
    p = "".join(ch for ch in phone if ch.isdigit() or ch == "+").lstrip("+")
    if p.startswith("54"):
        rest = p[2:]
    elif p.startswith("0"):
        rest = p.lstrip("0")
    else:
        rest = p
    if not rest.startswith("9"):
        rest = "9" + rest
    return "+54" + rest

def _fmt_date_es(iso_date: Optional[str]) -> str:
    """Convierte 'YYYY-MM-DD...' a algo legible tipo 'miércoles 23 jul', para
    mostrar en el mensaje de WhatsApp en vez de la fecha ISO cruda."""
    if not iso_date:
        return ""
    try:
        d = datetime.fromisoformat(iso_date[:10])
    except ValueError:
        return iso_date
    dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    return f"{dias[d.weekday()]} {d.day} {meses[d.month - 1]}"


async def _send_whatsapp_order_confirmation(order: Order):
    """Manda la confirmación del pedido por WhatsApp vía Twilio, usando una
    plantilla ya aprobada por Meta (una para efectivo, otra para transferencia).
    Nunca bloquea la creación del pedido si falla — solo queda en el log."""
    if not order.customer_phone:
        return
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_whatsapp = os.environ.get("TWILIO_WHATSAPP_FROM")  # ej: "whatsapp:+14155238886"
    template_efectivo = os.environ.get("TWILIO_TEMPLATE_EFECTIVO")
    template_transferencia = os.environ.get("TWILIO_TEMPLATE_TRANSFERENCIA")
    if not (account_sid and auth_token and from_whatsapp):
        logger.warning("WhatsApp de confirmación omitido: faltan credenciales de Twilio en el .env")
        return

    content_sid = template_transferencia if order.payment_method == "transferencia" else template_efectivo
    if not content_sid:
        logger.warning(f"WhatsApp de confirmación omitido: falta el template SID para pago '{order.payment_method}'")
        return

    try:
        import json
        from twilio.rest import Client

        cfg = await db.business_config.find_one({"id": "main"}, {"_id": 0}) or {}
        variables = {
            "1": order.customer_name,
            "2": order.code,
            "3": cfg.get("business_name", "el local"),
            "4": f"{order.total:.2f}",
            "5": _fmt_date_es(order.scheduled_date),
        }
        contact_raw = cfg.get("whatsapp") or cfg.get("phone") or ""
        contact = f"https://wa.me/{_normalize_ar_whatsapp_number(contact_raw).lstrip('+')}" if contact_raw else "-"
        if order.payment_method == "transferencia":
            variables["6"] = cfg.get("bank_alias") or "-"
            variables["7"] = cfg.get("bank_cbu") or "-"
            variables["8"] = contact
        else:
            variables["6"] = contact

        to_whatsapp = f"whatsapp:{_normalize_ar_whatsapp_number(order.customer_phone)}"
        client = Client(account_sid, auth_token)
        client.messages.create(
            from_=from_whatsapp,
            to=to_whatsapp,
            content_sid=content_sid,
            content_variables=json.dumps(variables),
        )
    except Exception as e:
        logger.error(f"No se pudo enviar el WhatsApp de confirmación del pedido {order.code}: {e}")
                
        
@api.get("/orders")
async def list_orders(status: Optional[str] = None, user: dict = Depends(current_user)):
    q = {}
    if status and status != "all":
        q["status"] = status
    cursor = db.orders.find(q, {"_id": 0}).sort("created_at", -1).limit(500)
    return [o async for o in cursor]


@api.get("/orders/next-delivery-dates")
async def next_delivery_dates():
    """Público (sin login): próximas fechas válidas de entrega para el
    selector de fecha del catálogo online."""
    return {"dates": _next_valid_delivery_dates(6)}


@api.post("/orders")
async def create_order(payload: Order, user: dict = Depends(current_user)):
    payload.id = new_id()
    seq = await next_counter("order")
    payload.code = f"PED-{seq:06d}"
    await db.orders.insert_one(payload.model_dump())
    return payload.model_dump()


@api.patch("/orders/{oid}")
async def update_order(oid: str, payload: dict, user: dict = Depends(current_user)):
    payload.pop("id", None)
    payload.pop("code", None)
    await db.orders.update_one({"id": oid}, {"$set": payload})
    return await db.orders.find_one({"id": oid}, {"_id": 0})


@api.delete("/orders/{oid}")
async def delete_order(oid: str, user: dict = Depends(require("encargado"))):
    await db.orders.update_one({"id": oid}, {"$set": {"status": "cancelado"}})
    return {"ok": True}


# Public order endpoint
@api.post("/public/orders")
async def public_create_order(payload: Order):
    _validate_delivery_date(payload.scheduled_date)
    _validate_order_minimum(payload.items)
    payload.id = new_id()
    seq = await next_counter("order")
    payload.code = f"PED-{seq:06d}"
    payload.source = "publico"
    payload.status = "pendiente"
    await db.orders.insert_one(payload.model_dump())
    await _notify_owner_new_order(payload)
    await _send_whatsapp_order_confirmation(payload)
    return {"ok": True, "code": payload.code, "id": payload.id}


@api.get("/public/catalog")
async def public_catalog():
    cfg = await db.business_config.find_one({"id": "main"}, {"_id": 0})
    bag_types = [b async for b in db.bag_types.find({"active": True}, {"_id": 0})]
    # Solo fruta/verdura activa con precio cargado — no mostramos insumos/packaging.
    products = [p async for p in db.products.find(
        {"active": True, "category": {"$in": ["fruta", "verdura", "frutos_secos"]}, "sale_price": {"$gt": 0}},
        {"_id": 0},
    ).sort("name", 1)]
    return {
        "business": {
            "name": cfg.get("business_name") if cfg else "BolsonesControl",
            "phone": cfg.get("phone") if cfg else None,
            "whatsapp": cfg.get("whatsapp") if cfg else None,
            "address": cfg.get("address") if cfg else None,
            "instagram": cfg.get("instagram") if cfg else None,
        },
        "bag_types": bag_types,
        "products": products,
    }

# ============================================================
# CASH SESSIONS
# ============================================================
@api.get("/cash/current")
async def cash_current(user: dict = Depends(current_user)):
    s = await db.cash_sessions.find_one({"status": "abierta"}, {"_id": 0}, sort=[("opened_at", -1)])
    return s


@api.post("/cash/open")
async def cash_open(payload: dict, user: dict = Depends(require("cajero", "encargado"))):
    existing = await db.cash_sessions.find_one({"status": "abierta"}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Ya hay una caja abierta")
    session = CashSession(
        opened_by=user["id"],
        opened_by_name=user["name"],
        initial_amount=float(payload.get("initial_amount", 0)),
    )
    await db.cash_sessions.insert_one(session.model_dump())
    return session.model_dump()


@api.post("/cash/movement")
async def cash_movement(payload: dict, user: dict = Depends(require("cajero", "encargado"))):
    session = await db.cash_sessions.find_one({"status": "abierta"}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=400, detail="No hay caja abierta")
    mv = CashMovement(
        type=payload.get("type", "ingreso"),
        amount=float(payload.get("amount", 0)),
        method=payload.get("method"),
        description=payload.get("description"),
    )
    await db.cash_sessions.update_one(
        {"id": session["id"]},
        {"$push": {"movements": mv.model_dump()}},
    )
    return mv.model_dump()


@api.post("/cash/close")
async def cash_close(payload: dict, user: dict = Depends(require("cajero", "encargado"))):
    session = await db.cash_sessions.find_one({"status": "abierta"}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=400, detail="No hay caja abierta")
    real = float(payload.get("real_amount", 0))
    # Expected = initial + sum(efectivo movements) + sum(efectivo sales)
    expected = float(session.get("initial_amount", 0))
    for mv in session.get("movements", []):
        if mv.get("method") == "efectivo" or mv.get("type") in ("ingreso", "retiro", "egreso"):
            if mv["type"] in ("venta", "ingreso") and (mv.get("method") == "efectivo" or mv["type"] == "ingreso"):
                expected += mv["amount"]
            elif mv["type"] in ("retiro", "egreso"):
                expected -= mv["amount"]
    diff = round(real - expected, 2)
    await db.cash_sessions.update_one(
        {"id": session["id"]},
        {"$set": {
            "status": "cerrada",
            "closed_at": now_iso(),
            "expected_amount": round(expected, 2),
            "real_amount": real,
            "difference": diff,
            "notes": payload.get("notes"),
        }},
    )
    return await db.cash_sessions.find_one({"id": session["id"]}, {"_id": 0})


@api.get("/cash/history")
async def cash_history(user: dict = Depends(current_user)):
    cursor = db.cash_sessions.find({}, {"_id": 0}).sort("opened_at", -1).limit(50)
    return [s async for s in cursor]


# ============================================================
# EXPENSES
# ============================================================
@api.get("/expenses")
async def list_expenses(user: dict = Depends(require("encargado"))):
    cursor = db.expenses.find({}, {"_id": 0}).sort("date", -1).limit(500)
    return [e async for e in cursor]


@api.post("/expenses")
async def create_expense(payload: Expense, user: dict = Depends(require("encargado"))):
    payload.id = new_id()
    await db.expenses.insert_one(payload.model_dump())
    return payload.model_dump()


@api.patch("/expenses/{eid}")
async def update_expense(eid: str, payload: dict, user: dict = Depends(require("encargado"))):
    payload.pop("id", None)
    await db.expenses.update_one({"id": eid}, {"$set": payload})
    return await db.expenses.find_one({"id": eid}, {"_id": 0})


@api.delete("/expenses/{eid}")
async def delete_expense(eid: str, user: dict = Depends(require("encargado"))):
    await db.expenses.delete_one({"id": eid})
    return {"ok": True}


# ============================================================
# EMPLOYEES
# ============================================================
@api.get("/employees")
async def list_employees(user: dict = Depends(current_user)):
    cursor = db.employees.find({}, {"_id": 0}).sort("name", 1)
    return [e async for e in cursor]


@api.post("/employees")
async def create_employee(payload: Employee, user: dict = Depends(require("encargado"))):
    payload.id = new_id()
    await db.employees.insert_one(payload.model_dump())
    return payload.model_dump()


@api.patch("/employees/{eid}")
async def update_employee(eid: str, payload: dict, user: dict = Depends(require("encargado"))):
    payload.pop("id", None)
    await db.employees.update_one({"id": eid}, {"$set": payload})
    return await db.employees.find_one({"id": eid}, {"_id": 0})


@api.delete("/employees/{eid}")
async def delete_employee(eid: str, user: dict = Depends(require("encargado"))):
    await db.employees.update_one({"id": eid}, {"$set": {"active": False}})
    return {"ok": True}

class CreateEmployeeLoginPayload(BaseModel):
    username: str  # para iniciar sesión (no hace falta que sea un mail real)
    password: str
    email: Optional[str] = None  # email de contacto real, opcional
    role: str = "lectura"  # etiqueta del puesto, no da permisos por sí sola
    permissions: List[str] = []  # lo que este usuario puede hacer en el sistema


@api.post("/employees/{eid}/create-login")
async def create_employee_login(eid: str, payload: CreateEmployeeLoginPayload,
                                user: dict = Depends(require_perm("empleados"))):
    emp = await db.employees.find_one({"id": eid}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    username = payload.username.lower().strip()
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Ese nombre de usuario ya existe")
    email = payload.email.lower().strip() if payload.email else None
    u = User(username=username, email=email, name=emp["name"], role=payload.role, phone=emp.get("phone"),
             permissions=payload.permissions)
    doc = u.model_dump()
    doc["password_hash"] = hash_password(payload.password)
    await db.users.insert_one(doc)
    await db.employees.update_one({"id": eid}, {"$set": {"user_id": u.id}})
    return {"ok": True, "user_id": u.id, "username": username}


@api.post("/employees/{eid}/unlink-login")
async def unlink_employee_login(eid: str, user: dict = Depends(require_perm("empleados"))):
    await db.employees.update_one({"id": eid}, {"$set": {"user_id": None}})
    return {"ok": True}


# ============================================================
# ATTENDANCE (fichaje por QR — entrada/salida)
# ============================================================
@api.get("/attendance/me")
async def my_attendance_status(user: dict = Depends(current_user)):
    """Usado por la pantalla de fichaje: dice quién sos y si te toca marcar
    entrada o salida, según tu último fichaje."""
    emp = await db.employees.find_one({"user_id": user["id"], "active": True}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Tu usuario no está vinculado a ningún empleado activo")
    last = await db.attendance.find_one({"employee_id": emp["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    next_type = "salida" if (last and last["type"] == "entrada") else "entrada"
    return {"employee": emp, "last": last, "next_type": next_type}


@api.post("/attendance/clock")
async def clock_attendance(user: dict = Depends(current_user)):
    """Confirma el fichaje del usuario logueado (entrada o salida, automático)."""
    emp = await db.employees.find_one({"user_id": user["id"], "active": True}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Tu usuario no está vinculado a ningún empleado activo")
    last = await db.attendance.find_one({"employee_id": emp["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    next_type = "salida" if (last and last["type"] == "entrada") else "entrada"
    entry = Attendance(employee_id=emp["id"], employee_name=emp["name"], type=next_type)
    await db.attendance.insert_one(entry.model_dump())
    return entry.model_dump()


@api.get("/attendance")
async def list_attendance(employee_id: Optional[str] = None, days: int = 31,
                          user: dict = Depends(require("encargado"))):
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = {"created_at": {"$gte": start}}
    if employee_id:
        q["employee_id"] = employee_id
    cursor = db.attendance.find(q, {"_id": 0}).sort("created_at", -1).limit(1000)
    return [a async for a in cursor]


def _pair_attendance_hours(entries: list) -> float:
    """Suma las horas trabajadas emparejando cada 'entrada' con la 'salida'
    siguiente. Fichajes sin cerrar (entrada sin salida todavía) no se cuentan."""
    entries = sorted(entries, key=lambda e: e["created_at"])
    total_seconds = 0.0
    pending_in = None
    for e in entries:
        if e["type"] == "entrada":
            pending_in = e["created_at"]
        elif e["type"] == "salida" and pending_in:
            try:
                t_in = datetime.fromisoformat(pending_in.replace("Z", "+00:00"))
                t_out = datetime.fromisoformat(e["created_at"].replace("Z", "+00:00"))
                total_seconds += max(0, (t_out - t_in).total_seconds())
            except Exception:
                pass
            pending_in = None
    return round(total_seconds / 3600, 2)


@api.get("/payroll/calc")
async def payroll_calc(employee_id: str, period_start: str, period_end: str,
                       user: dict = Depends(require("encargado"))):
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    entries = [a async for a in db.attendance.find(
        {"employee_id": employee_id, "created_at": {"$gte": period_start, "$lte": period_end}},
        {"_id": 0},
    )]
    hours = _pair_attendance_hours(entries)
    worked_days = len({e["created_at"][:10] for e in entries if e["type"] == "entrada"})

    payment_type = emp.get("payment_type", "mensual")
    rate = float(emp.get("payment_amount", 0))
    if payment_type == "hora":
        amount = round(hours * rate, 2)
    elif payment_type == "dia":
        amount = round(worked_days * rate, 2)
    elif payment_type in ("semanal", "quincenal", "mensual"):
        amount = rate  # monto fijo, las horas son solo de referencia
    else:  # comision, changa: no se calcula automático
        amount = 0

    already_paid = await db.payroll_payments.find_one({
        "employee_id": employee_id, "period_start": period_start, "period_end": period_end,
    }, {"_id": 0})

    return {
        "employee": emp, "hours_worked": hours, "worked_days": worked_days,
        "suggested_amount": amount, "already_paid": already_paid,
    }


class PayrollPayPayload(BaseModel):
    employee_id: str
    period_start: str
    period_end: str
    hours_worked: float = 0
    amount: float


@api.post("/payroll/pay")
async def payroll_pay(payload: PayrollPayPayload, user: dict = Depends(require("encargado"))):
    emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    existing = await db.payroll_payments.find_one({
        "employee_id": payload.employee_id,
        "period_start": payload.period_start, "period_end": payload.period_end,
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Ese período ya fue pagado para este empleado")

    expense = Expense(
        description=f"Sueldo {emp['name']} ({payload.period_start[:10]} a {payload.period_end[:10]})",
        category="sueldos", amount=payload.amount, type="fijo", payment_status="pagado",
    )
    await db.expenses.insert_one(expense.model_dump())

    pay = PayrollPayment(
        employee_id=payload.employee_id, employee_name=emp["name"],
        period_start=payload.period_start, period_end=payload.period_end,
        hours_worked=payload.hours_worked, amount=payload.amount,
        expense_id=expense.id, user_id=user["id"], user_name=user["name"],
    )
    await db.payroll_payments.insert_one(pay.model_dump())
    return pay.model_dump()


@api.get("/payroll/history")
async def payroll_history(employee_id: Optional[str] = None, user: dict = Depends(require("encargado"))):
    q = {"employee_id": employee_id} if employee_id else {}
    cursor = db.payroll_payments.find(q, {"_id": 0}).sort("created_at", -1).limit(200)
    return [p async for p in cursor]


# ============================================================
# WASTE
# ============================================================
@api.get("/waste")
async def list_waste(user: dict = Depends(current_user)):
    cursor = db.waste.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    return [w async for w in cursor]


@api.post("/waste")
async def create_waste(payload: Waste, user: dict = Depends(require("encargado", "armador"))):
    payload.id = new_id()
    payload.user_id = user["id"]
    payload.user_name = user["name"]
    prod = await db.products.find_one({"id": payload.product_id}, {"_id": 0})
    if prod:
        payload.product_name = prod["name"]
        qty = float(payload.quantity)
        # Si no vino un costo estimado, valuar la merma con el costo promedio del producto
        if not payload.estimated_cost or float(payload.estimated_cost) <= 0:
            payload.estimated_cost = round(float(prod.get("average_cost", 0)) * qty, 2)
        # Descontar stock de forma atómica (no baja de 0 en silencio)
        res = await db.products.update_one(
            {"id": payload.product_id, "current_stock": {"$gte": qty}},
            {"$inc": {"current_stock": -qty}},
        )
        if res.modified_count == 0:
            disp = float(prod.get("current_stock", 0))
            raise HTTPException(status_code=400,
                                detail=f"No hay tanto stock de {prod['name']} para dar de baja (hay {disp} {payload.unit})")
        await add_stock_movement(payload.product_id, "merma", -qty, payload.unit,
                                 cost=payload.estimated_cost, reason=f"Merma: {payload.reason}",
                                 user=user)
    await db.waste.insert_one(payload.model_dump())
    return payload.model_dump()


# ============================================================
# BUSINESS CONFIG
# ============================================================
@api.get("/config")
async def get_config(user: dict = Depends(current_user)):
    cfg = await db.business_config.find_one({"id": "main"}, {"_id": 0})
    if not cfg:
        cfg = BusinessConfig().model_dump()
        await db.business_config.insert_one(cfg)
    return cfg


@api.put("/config")
async def update_config(payload: dict, user: dict = Depends(require("encargado"))):
    payload.pop("id", None)
    await db.business_config.update_one({"id": "main"}, {"$set": payload}, upsert=True)
    return await db.business_config.find_one({"id": "main"}, {"_id": 0})


# ============================================================
# DASHBOARD + REPORTS
# ============================================================
def _today_range():
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _month_range():
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start.isoformat(), now.isoformat()


@api.get("/dashboard")
async def dashboard(user: dict = Depends(current_user)):
    today_start, today_end = _today_range()
    month_start, _ = _month_range()

    sales_today_cursor = db.sales.find({"created_at": {"$gte": today_start, "$lt": today_end}}, {"_id": 0})
    sales_today = [s async for s in sales_today_cursor]
    total_today = sum(s.get("total", 0) for s in sales_today)

    sales_month_cursor = db.sales.find({"created_at": {"$gte": month_start}}, {"_id": 0})
    sales_month = [s async for s in sales_month_cursor]
    total_month = sum(s.get("total", 0) for s in sales_month)

    bags_today = await db.bags.count_documents({"created_at": {"$gte": today_start, "$lt": today_end}})
    bags_sold = await db.bags.count_documents({"status": "vendido"})
    bags_available = await db.bags.count_documents({"status": "disponible"})

    # Stock crítico
    low_stock_cursor = db.products.find(
        {"$expr": {"$lte": ["$current_stock", "$minimum_stock"]}, "active": True},
        {"_id": 0}
    )
    low_stock = [p async for p in low_stock_cursor]

    # Mermas mes
    waste_cursor = db.waste.find({"created_at": {"$gte": month_start}}, {"_id": 0})
    waste_month = [w async for w in waste_cursor]
    waste_total = sum(w.get("estimated_cost", 0) for w in waste_month)

    pending_orders = await db.orders.count_documents({"status": {"$in": ["pendiente", "confirmado", "preparacion"]}})

    today_orders_cursor = db.orders.find({"scheduled_date": {"$gte": today_start, "$lt": today_end}}, {"_id": 0})
    today_deliveries = [o async for o in today_orders_cursor]

    cash = await db.cash_sessions.find_one({"status": "abierta"}, {"_id": 0}, sort=[("opened_at", -1)])

    # Estimación de ganancia: ingresos - costo estimado bolsones vendidos + ventas productos
    margin_today = 0.0
    for s in sales_today:
        for it in s.get("items", []):
            if it.get("type") == "bag":
                # find bag for cost
                b = await db.bags.find_one({"id": it["ref_id"]}, {"_id": 0})
                if b:
                    margin_today += float(it.get("subtotal", 0)) - float(b.get("estimated_cost", 0))

    # Bolsones armados hace mas de 2 dias
    threshold = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    old_bags = await db.bags.count_documents({"status": "disponible", "created_at": {"$lt": threshold}})

    alerts = []
    for p in low_stock[:8]:
        alerts.append({
            "type": "stock",
            "level": "warning",
            "message": f"Quedan {p['current_stock']} {p.get('unit','')} de {p['name']}",
        })
    if pending_orders:
        alerts.append({"type": "order", "level": "info", "message": f"Hay {pending_orders} pedidos pendientes"})
    if old_bags:
        alerts.append({"type": "bag", "level": "warning", "message": f"Hay {old_bags} bolsones armados hace más de 2 días"})

    return {
        "sales_today_total": round(total_today, 2),
        "sales_today_count": len(sales_today),
        "sales_month_total": round(total_month, 2),
        "bags_today": bags_today,
        "bags_sold_total": bags_sold,
        "bags_available": bags_available,
        "low_stock_count": len(low_stock),
        "low_stock": low_stock[:10],
        "waste_month_total": round(waste_total, 2),
        "pending_orders": pending_orders,
        "today_deliveries": today_deliveries,
        "cash_session": cash,
        "estimated_margin_today": round(margin_today, 2),
        "alerts": alerts,
    }


@api.get("/reports/sales")
async def report_sales(days: int = 7, user: dict = Depends(current_user)):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    cursor = db.sales.find({"created_at": {"$gte": start.isoformat()}}, {"_id": 0})
    sales = [s async for s in cursor]
    # By day
    by_day = {}
    for s in sales:
        d = s["created_at"][:10]
        by_day[d] = by_day.get(d, 0) + float(s.get("total", 0))
    series = sorted([{"date": k, "total": round(v, 2)} for k, v in by_day.items()], key=lambda x: x["date"])

    by_method = {}
    for s in sales:
        m = s.get("payment_method", "efectivo")
        by_method[m] = by_method.get(m, 0) + float(s.get("total", 0))

    # Top bags
    bag_counter = {}
    for s in sales:
        for it in s.get("items", []):
            if it.get("type") == "bag":
                name = it.get("name", "Bolsón")
                bag_counter[name] = bag_counter.get(name, 0) + 1
    top_bags = sorted([{"name": k, "qty": v} for k, v in bag_counter.items()], key=lambda x: -x["qty"])[:10]

    # Top products
    prod_counter = {}
    for s in sales:
        for it in s.get("items", []):
            if it.get("type") == "product":
                name = it.get("name", "Producto")
                prod_counter[name] = prod_counter.get(name, 0) + float(it.get("quantity", 0))
    top_products = sorted([{"name": k, "qty": round(v, 2)} for k, v in prod_counter.items()], key=lambda x: -x["qty"])[:10]

    total = sum(float(s.get("total", 0)) for s in sales)

    return {
        "total": round(total, 2),
        "count": len(sales),
        "series": series,
        "by_method": by_method,
        "top_bags": top_bags,
        "top_products": top_products,
    }


@api.get("/reports/stock")
async def report_stock(user: dict = Depends(current_user)):
    cursor = db.products.find({"active": True}, {"_id": 0})
    products = [p async for p in cursor]
    total_value = sum(float(p.get("current_stock", 0)) * float(p.get("average_cost", 0)) for p in products)
    low = [p for p in products if float(p.get("current_stock", 0)) <= float(p.get("minimum_stock", 0))]
    return {
        "total_products": len(products),
        "total_value": round(total_value, 2),
        "low_stock_count": len(low),
        "low_stock": low,
        "products": products,
    }



# ============================================================
# SALES STATIONS
# ============================================================
@api.get("/stations")
async def list_stations(user: dict = Depends(current_user)):
    cursor = db.sales_stations.find({"active": True}, {"_id": 0}).sort("name", 1)
    return [s async for s in cursor]


@api.post("/stations")
async def create_station(payload: SalesStation, user: dict = Depends(require("encargado"))):
    payload.id = new_id()
    await db.sales_stations.insert_one(payload.model_dump())
    return payload.model_dump()


@api.patch("/stations/{sid}")
async def update_station(sid: str, payload: dict, user: dict = Depends(require("encargado"))):
    payload.pop("id", None)
    await db.sales_stations.update_one({"id": sid}, {"$set": payload})
    return await db.sales_stations.find_one({"id": sid}, {"_id": 0})


# ============================================================
# TICKETS (Ventas en curso)
# ============================================================
def _recompute_ticket_totals(t: dict) -> dict:
    subtotal_full = 0.0
    subtotal = 0.0
    for it in t.get("items", []):
        subtotal_full += float(it.get("subtotal_full", 0))
        subtotal += float(it.get("subtotal", 0))
    total_discounts = round(subtotal_full - subtotal, 2)
    t["subtotal_full"] = round(subtotal_full, 2)
    t["subtotal"] = round(subtotal, 2)
    t["total_discounts"] = total_discounts
    t["total"] = round(subtotal, 2)
    return t


def _compute_item(it: dict) -> dict:
    q = float(it.get("quantity", 0))
    up = float(it.get("unit_price", 0))
    full = round(q * up, 2)
    disc_amount = 0.0
    dt = it.get("discount_type")
    dv = float(it.get("discount_value", 0) or 0)
    if dt == "percent":
        disc_amount = round(full * (dv / 100), 2)
    elif dt == "amount":
        disc_amount = round(dv, 2)
    disc_amount = max(0, min(disc_amount, full))
    it["subtotal_full"] = full
    it["discount_amount"] = disc_amount
    it["subtotal"] = round(full - disc_amount, 2)
    return it


@api.get("/tickets")
async def list_tickets(status: Optional[str] = None, station_id: Optional[str] = None,
                       user: dict = Depends(current_user)):
    q = {}
    if status and status != "all":
        q["status"] = status
    if station_id:
        q["station_id"] = station_id
    cursor = db.tickets.find(q, {"_id": 0}).sort("created_at", -1).limit(300)
    return [t async for t in cursor]


@api.get("/tickets/{tid}")
async def get_ticket(tid: str, user: dict = Depends(current_user)):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0}) or \
        await db.tickets.find_one({"code": tid.upper()}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return t


class TicketCreatePayload(BaseModel):
    station_id: str
    notes: Optional[str] = None


@api.post("/tickets")
async def create_ticket(payload: TicketCreatePayload,
                        user: dict = Depends(require("cajero", "encargado", "armador"))):
    station = await db.sales_stations.find_one({"id": payload.station_id}, {"_id": 0})
    if not station:
        raise HTTPException(status_code=404, detail="Puesto no encontrado")
    seq = await next_counter("ticket")
    code = f"TKT-{seq:06d}"
    t = Ticket(
        code=code,
        station_id=station["id"],
        station_name=station["name"],
        created_by=user["id"],
        created_by_name=user["name"],
        notes=payload.notes,
    )
    await db.tickets.insert_one(t.model_dump())
    return t.model_dump()


class TicketItemPayload(BaseModel):
    """Peso llega por este único canal desacoplado (a futuro: WebSocket balanza)."""
    type: str = "product"  # product | bag
    ref_id: str  # product_id, product_plu, or bag code
    quantity: float
    discount_type: Optional[str] = None  # "percent" | "amount"
    discount_value: float = 0
    discount_reason: Optional[str] = None


@api.post("/tickets/{tid}/items")
async def add_ticket_item(tid: str, payload: TicketItemPayload,
                          user: dict = Depends(require("cajero", "encargado", "armador"))):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if t["status"] != "abierto":
        raise HTTPException(status_code=400, detail=f"Ticket ya está {t['status']}, no editable")

    if payload.type == "bag":
        b = await db.bags.find_one({"code": payload.ref_id.upper()}, {"_id": 0}) or \
            await db.bags.find_one({"id": payload.ref_id}, {"_id": 0})
        if not b:
            raise HTTPException(status_code=404, detail="Bolsón no encontrado")
        if b["status"] != "disponible":
            raise HTTPException(status_code=400, detail=f"Bolsón está {b['status']}")
        item = {
            "id": new_id(), "type": "bag", "ref_id": b["id"], "name": b["bag_type_name"],
            "plu": b["code"], "sale_mode": "per_unit", "quantity": 1, "unit": "unidad",
            "unit_price": float(b["final_price"]),
            "discount_type": payload.discount_type,
            "discount_value": float(payload.discount_value or 0),
            "discount_reason": payload.discount_reason,
            "added_at": now_iso(), "added_by": user["id"], "added_by_name": user["name"],
        }
    else:
        # Try id first, then plu
        prod = await db.products.find_one({"id": payload.ref_id}, {"_id": 0}) or \
               await db.products.find_one({"plu": payload.ref_id}, {"_id": 0})
        if not prod:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        item = {
            "id": new_id(), "type": "product", "ref_id": prod["id"], "name": prod["name"],
            "plu": prod.get("plu"),
            "sale_mode": prod.get("sale_mode", "per_weight"),
            "quantity": float(payload.quantity),
            "unit": prod.get("unit", "kg"),
            "unit_price": float(prod.get("sale_price", 0)),
            "discount_type": payload.discount_type,
            "discount_value": float(payload.discount_value or 0),
            "discount_reason": payload.discount_reason,
            "added_at": now_iso(), "added_by": user["id"], "added_by_name": user["name"],
        }

    item = _compute_item(item)
    t["items"].append(item)
    t = _recompute_ticket_totals(t)
    await db.tickets.update_one({"id": tid}, {"$set": {
        "items": t["items"],
        "subtotal_full": t["subtotal_full"],
        "subtotal": t["subtotal"],
        "total_discounts": t["total_discounts"],
        "total": t["total"],
    }})
    return t


@api.patch("/tickets/{tid}/items/{iid}")
async def update_ticket_item(tid: str, iid: str, payload: dict,
                             user: dict = Depends(require("cajero", "encargado", "armador"))):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if t["status"] != "abierto":
        raise HTTPException(status_code=400, detail=f"Ticket ya está {t['status']}, no editable")
    found = False
    for it in t["items"]:
        if it["id"] == iid:
            for k in ("quantity", "unit_price", "discount_type", "discount_value", "discount_reason"):
                if k in payload:
                    it[k] = payload[k]
            _compute_item(it)
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    t = _recompute_ticket_totals(t)
    await db.tickets.update_one({"id": tid}, {"$set": {
        "items": t["items"], "subtotal_full": t["subtotal_full"],
        "subtotal": t["subtotal"], "total_discounts": t["total_discounts"], "total": t["total"],
    }})
    return t


@api.delete("/tickets/{tid}/items/{iid}")
async def remove_ticket_item(tid: str, iid: str,
                             user: dict = Depends(require("cajero", "encargado", "armador"))):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if t["status"] != "abierto":
        raise HTTPException(status_code=400, detail=f"Ticket ya está {t['status']}, no editable")
    t["items"] = [it for it in t["items"] if it["id"] != iid]
    t = _recompute_ticket_totals(t)
    await db.tickets.update_one({"id": tid}, {"$set": {
        "items": t["items"], "subtotal_full": t["subtotal_full"],
        "subtotal": t["subtotal"], "total_discounts": t["total_discounts"], "total": t["total"],
    }})
    return t


@api.post("/tickets/{tid}/send")
async def send_ticket_to_cashier(tid: str,
                                 user: dict = Depends(require("cajero", "encargado", "armador"))):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if t["status"] != "abierto":
        raise HTTPException(status_code=400, detail=f"Ticket está {t['status']}")
    if not t.get("items"):
        raise HTTPException(status_code=400, detail="Ticket vacío")
    await db.tickets.update_one({"id": tid}, {"$set": {
        "status": "pendiente_caja",
        "sent_to_cashier_at": now_iso(),
    }})
    return await db.tickets.find_one({"id": tid}, {"_id": 0})


class TicketConfirmPayload(BaseModel):
    payment_method: str = "efectivo"
    customer_id: Optional[str] = None
    notes: Optional[str] = None


@api.post("/tickets/{tid}/confirm")
async def confirm_ticket(tid: str, payload: TicketConfirmPayload,
                         user: dict = Depends(require("cajero", "encargado"))):
    """Cobrar el ticket: descuenta stock, crea Sale, marca ticket cobrado."""
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if t["status"] not in ("pendiente_caja", "abierto"):
        raise HTTPException(status_code=400, detail=f"Ticket ya está {t['status']}")

    # Validación temprana de bolsones. El stock de productos se valida
    # de forma atómica más abajo (al descontar), para evitar condiciones de carrera.
    for it in t["items"]:
        if it["type"] == "bag":
            b = await db.bags.find_one({"id": it["ref_id"]}, {"_id": 0})
            if not b or b["status"] != "disponible":
                raise HTTPException(status_code=400, detail=f"Bolsón {it['plu']} no disponible")

    # Create Sale — la caja abierta es obligatoria para poder cobrar
    session = await db.cash_sessions.find_one({"status": "abierta"}, {"_id": 0}, sort=[("opened_at", -1)])
    if not session:
        raise HTTPException(status_code=400, detail="No hay caja abierta. Abrí la caja antes de cobrar.")
    customer_name = None
    if payload.customer_id:
        cust = await db.customers.find_one({"id": payload.customer_id}, {"_id": 0})
        if cust:
            customer_name = cust["name"]

    sale_items = []
    for it in t["items"]:
        sale_items.append(SaleItem(
            type="bag" if it["type"] == "bag" else "product",
            ref_id=it["ref_id"],
            name=it["name"],
            code=it.get("plu"),
            quantity=float(it["quantity"]),
            unit=it.get("unit", "kg"),
            unit_price=float(it["unit_price"]),
            subtotal=float(it["subtotal"]),
        ))

    sale = Sale(
        items=sale_items,
        subtotal=float(t["subtotal"]),
        discount=0,
        total=float(t["total"]),
        payment_method=payload.payment_method,
        customer_id=payload.customer_id,
        customer_name=customer_name,
        user_id=user["id"],
        user_name=user["name"],
        cash_session_id=session["id"] if session else None,
        notes=f"Ticket {t['code']} · Puesto {t.get('station_name','')}",
    )

    # Descontar stock de forma ATÓMICA y CONDICIONAL (sin condiciones de carrera).
    # Si algún ítem no tiene stock, se revierte TODO lo aplicado en este cobro.
    stock_aplicado = []      # [(product_id, qty)] ya descontados
    bolsones_aplicados = []  # [bag_id] ya marcados vendidos

    async def _revertir():
        for pid, q in stock_aplicado:
            await db.products.update_one({"id": pid}, {"$inc": {"current_stock": q}})
        for bid in bolsones_aplicados:
            await db.bags.update_one({"id": bid}, {
                "$set": {"status": "disponible"},
                "$unset": {"sold_at": "", "sale_id": ""},
            })

    for it in t["items"]:
        if it["type"] == "product":
            qty = float(it["quantity"])
            res = await db.products.update_one(
                {"id": it["ref_id"], "current_stock": {"$gte": qty}},
                {"$inc": {"current_stock": -qty}},
            )
            if res.modified_count == 0:
                await _revertir()
                prod = await db.products.find_one({"id": it["ref_id"]}, {"_id": 0})
                disp = prod.get("current_stock", 0) if prod else 0
                raise HTTPException(status_code=400,
                                    detail=f"Stock insuficiente de {it['name']} (hay {disp} {it.get('unit','kg')})")
            stock_aplicado.append((it["ref_id"], qty))
            await add_stock_movement(it["ref_id"], "salida", -qty, it.get("unit", "kg"),
                                     reason=f"Venta ticket {t['code']}", user=user, ref_id=sale.id)
        elif it["type"] == "bag":
            res = await db.bags.update_one(
                {"id": it["ref_id"], "status": "disponible"},
                {"$set": {"status": "vendido", "sold_at": now_iso(), "sale_id": sale.id}},
            )
            if res.modified_count == 0:
                await _revertir()
                raise HTTPException(status_code=400, detail=f"Bolsón {it.get('plu')} ya no está disponible")
            bolsones_aplicados.append(it["ref_id"])

    await db.sales.insert_one(sale.model_dump())

    # Update ticket
    await db.tickets.update_one({"id": tid}, {"$set": {
        "status": "cobrado",
        "confirmed_at": now_iso(),
        "confirmed_by": user["id"],
        "confirmed_by_name": user["name"],
        "payment_method": payload.payment_method,
        "customer_id": payload.customer_id,
        "customer_name": customer_name,
        "sale_id": sale.id,
        "cash_session_id": session["id"] if session else None,
    }})

    # Update customer
    if payload.customer_id:
        await db.customers.update_one(
            {"id": payload.customer_id},
            {"$inc": {"total_spent": float(t["total"])}, "$set": {"last_purchase_at": now_iso()}},
        )

    # Update cash session
    if session:
        mv = CashMovement(
            type="venta", amount=float(t["total"]),
            method=payload.payment_method,
            description=f"Ticket {t['code']}", reference_id=sale.id,
        )
        await db.cash_sessions.update_one(
            {"id": session["id"]},
            {"$push": {"movements": mv.model_dump()},
             "$inc": {f"sales_by_method.{payload.payment_method}": float(t["total"])}},
        )

    return {"ticket": await db.tickets.find_one({"id": tid}, {"_id": 0}), "sale": sale.model_dump()}


@api.post("/tickets/{tid}/cancel")
async def cancel_ticket(tid: str, user: dict = Depends(require("cajero", "encargado", "armador"))):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if t["status"] == "cobrado":
        raise HTTPException(status_code=400, detail="Ticket ya cobrado, no se puede cancelar")
    await db.tickets.update_one({"id": tid}, {"$set": {"status": "cancelado"}})
    return {"ok": True}


# ============================================================
# PRICE HISTORY (bulk-prices moved above /products/{id} to fix route ordering)
# ============================================================


@api.get("/products/{pid}/price-history")
async def price_history(pid: str, user: dict = Depends(current_user)):
    cursor = db.price_history.find({"product_id": pid}, {"_id": 0}).sort("created_at", -1).limit(50)
    return [h async for h in cursor]


# ============================================================
# RECLASSIFICATION (degradar producto)
# ============================================================
class ReclassifyPayload(BaseModel):
    source_product_id: str
    target_product_id: Optional[str] = None  # if None, use source's reclassification_target_id
    quantity: float
    reason: Optional[str] = None


@api.post("/reclassify")
async def reclassify(payload: ReclassifyPayload,
                     user: dict = Depends(require("encargado", "armador"))):
    src = await db.products.find_one({"id": payload.source_product_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Producto origen no encontrado")

    target_id = payload.target_product_id or src.get("reclassification_target_id")
    if not target_id:
        raise HTTPException(status_code=400, detail="No hay producto destino configurado")
    tgt = await db.products.find_one({"id": target_id}, {"_id": 0})
    if not tgt:
        raise HTTPException(status_code=404, detail="Producto destino no encontrado")

    qty = float(payload.quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Cantidad debe ser mayor a 0")
    if float(src.get("current_stock", 0)) < qty:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente de {src['name']}")

    src_price = float(src.get("sale_price", 0))
    tgt_price = float(tgt.get("sale_price", 0))
    loss = round((src_price - tgt_price) * qty, 2)
    loss = max(0, loss)

    # Move stock
    await db.products.update_one({"id": src["id"]}, {"$inc": {"current_stock": -qty}})
    await db.products.update_one({"id": tgt["id"]}, {"$inc": {"current_stock": qty}})

    # Movements
    await add_stock_movement(src["id"], "reclasificacion_out", -qty, src.get("unit", "kg"),
                             cost=src.get("average_cost"), reason=f"Reclasificación → {tgt['name']}",
                             user=user)
    await add_stock_movement(tgt["id"], "reclasificacion_in", qty, tgt.get("unit", "kg"),
                             cost=src.get("average_cost"), reason=f"Reclasificado desde {src['name']}",
                             user=user)

    rec = Reclassification(
        source_product_id=src["id"], source_product_name=src["name"], source_unit_price=src_price,
        target_product_id=tgt["id"], target_product_name=tgt["name"], target_unit_price=tgt_price,
        quantity=qty, unit=src.get("unit", "kg"),
        loss_amount=loss, reason=payload.reason,
        user_id=user["id"], user_name=user["name"],
    )
    await db.reclassifications.insert_one(rec.model_dump())
    return rec.model_dump()


@api.get("/reclassifications")
async def list_reclassifications(user: dict = Depends(current_user)):
    cursor = db.reclassifications.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    return [r async for r in cursor]


# ============================================================
# INTELLIGENCE REPORTS
# ============================================================
def _period_start(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


@api.get("/reports/losses")
async def report_losses(days: int = 30, user: dict = Depends(require("encargado"))):
    """Pérdidas por producto: decomiso + reclasificación + descuentos."""
    start = _period_start(days)

    # Decomiso (waste)
    losses_by_prod = {}  # product_id -> {name, decomiso_qty, decomiso_amount, reclass_qty, reclass_amount, discount_amount}

    waste_cursor = db.waste.find({"created_at": {"$gte": start}}, {"_id": 0})
    async for w in waste_cursor:
        pid = w["product_id"]
        d = losses_by_prod.setdefault(pid, {
            "product_id": pid, "product_name": w.get("product_name"),
            "decomiso_qty": 0, "decomiso_amount": 0,
            "reclass_qty": 0, "reclass_amount": 0,
            "discount_amount": 0,
        })
        d["decomiso_qty"] += float(w.get("quantity", 0))
        d["decomiso_amount"] += float(w.get("estimated_cost", 0))

    rec_cursor = db.reclassifications.find({"created_at": {"$gte": start}}, {"_id": 0})
    async for r in rec_cursor:
        pid = r["source_product_id"]
        d = losses_by_prod.setdefault(pid, {
            "product_id": pid, "product_name": r.get("source_product_name"),
            "decomiso_qty": 0, "decomiso_amount": 0,
            "reclass_qty": 0, "reclass_amount": 0,
            "discount_amount": 0,
        })
        d["reclass_qty"] += float(r.get("quantity", 0))
        d["reclass_amount"] += float(r.get("loss_amount", 0))

    # Ticket discounts (margin loss)
    tick_cursor = db.tickets.find({"status": "cobrado", "confirmed_at": {"$gte": start}}, {"_id": 0})
    async for t in tick_cursor:
        for it in t.get("items", []):
            if it.get("type") != "product":
                continue
            pid = it["ref_id"]
            disc = float(it.get("discount_amount", 0))
            if disc <= 0:
                continue
            d = losses_by_prod.setdefault(pid, {
                "product_id": pid, "product_name": it.get("name"),
                "decomiso_qty": 0, "decomiso_amount": 0,
                "reclass_qty": 0, "reclass_amount": 0,
                "discount_amount": 0,
            })
            d["discount_amount"] += disc

    # Compute total + merma %
    products = {p["id"]: p async for p in db.products.find({}, {"_id": 0})}
    # Purchased qty per product in period (for merma %)
    purchased_qty = {}
    pur_cursor = db.purchases.find({"created_at": {"$gte": start}}, {"_id": 0})
    async for pur in pur_cursor:
        for it in pur.get("items", []):
            purchased_qty[it["product_id"]] = purchased_qty.get(it["product_id"], 0) + float(it.get("kg_equivalent", 0))

    result = []
    for pid, d in losses_by_prod.items():
        prod = products.get(pid, {})
        total_loss = round(d["decomiso_amount"] + d["reclass_amount"] + d["discount_amount"], 2)
        total_qty_lost = d["decomiso_qty"] + d["reclass_qty"]
        entered = purchased_qty.get(pid, 0)
        merma_pct = round((total_qty_lost / entered * 100), 2) if entered > 0 else None
        d["product_name"] = prod.get("name", d.get("product_name"))
        d["total_loss"] = total_loss
        d["total_qty_lost"] = round(total_qty_lost, 3)
        d["entered_qty"] = round(entered, 3)
        d["merma_pct"] = merma_pct
        d["unit"] = prod.get("unit", "kg")
        result.append(d)

    result.sort(key=lambda x: -x["total_loss"])
    grand_total = round(sum(r["total_loss"] for r in result), 2)
    return {"period_days": days, "grand_total_loss": grand_total, "by_product": result}


@api.get("/reports/ideal-vs-real")
async def report_ideal_vs_real(days: int = 30, user: dict = Depends(require("encargado"))):
    """
    IDEAL (facturación potencial) = REAL (facturado) + DECOMISO + RECLASIFICACION + DESCUENTOS
    Por producto y global. Cada pérdida se valúa a precio pleno del producto.
    """
    start = _period_start(days)
    products = {p["id"]: p async for p in db.products.find({}, {"_id": 0})}

    per_prod = {}  # pid -> {real, decomiso_loss, reclass_loss, discount_loss, sold_qty}
    def _prod_entry(pid, name=None, unit=None):
        return per_prod.setdefault(pid, {
            "product_id": pid, "product_name": name or products.get(pid, {}).get("name"),
            "unit": unit or products.get(pid, {}).get("unit", "kg"),
            "real": 0, "decomiso_loss": 0, "reclass_loss": 0, "discount_loss": 0,
            "sold_qty": 0,
        })

    # Real revenue from sales (bag sales aggregated by bag, product sales by product)
    sales_cursor = db.sales.find({"created_at": {"$gte": start}}, {"_id": 0})
    async for s in sales_cursor:
        for it in s.get("items", []):
            if it.get("type") != "product":
                continue
            e = _prod_entry(it["ref_id"], it.get("name"))
            e["real"] += float(it.get("subtotal", 0))
            e["sold_qty"] += float(it.get("quantity", 0))

    # Decomiso (waste) valued at CURRENT sale price
    waste_cursor = db.waste.find({"created_at": {"$gte": start}}, {"_id": 0})
    async for w in waste_cursor:
        prod = products.get(w["product_id"], {})
        price = float(prod.get("sale_price", 0))
        e = _prod_entry(w["product_id"], w.get("product_name"))
        e["decomiso_loss"] += round(price * float(w.get("quantity", 0)), 2)

    # Reclassification loss
    rec_cursor = db.reclassifications.find({"created_at": {"$gte": start}}, {"_id": 0})
    async for r in rec_cursor:
        e = _prod_entry(r["source_product_id"], r.get("source_product_name"))
        e["reclass_loss"] += float(r.get("loss_amount", 0))

    # Discounts from cobrado tickets
    tick_cursor = db.tickets.find({"status": "cobrado", "confirmed_at": {"$gte": start}}, {"_id": 0})
    async for t in tick_cursor:
        for it in t.get("items", []):
            if it.get("type") != "product":
                continue
            e = _prod_entry(it["ref_id"], it.get("name"))
            e["discount_loss"] += float(it.get("discount_amount", 0))

    for pid, e in per_prod.items():
        e["real"] = round(e["real"], 2)
        e["decomiso_loss"] = round(e["decomiso_loss"], 2)
        e["reclass_loss"] = round(e["reclass_loss"], 2)
        e["discount_loss"] = round(e["discount_loss"], 2)
        e["ideal"] = round(e["real"] + e["decomiso_loss"] + e["reclass_loss"] + e["discount_loss"], 2)
        e["gap"] = round(e["ideal"] - e["real"], 2)
        e["gap_pct"] = round((e["gap"] / e["ideal"] * 100), 2) if e["ideal"] > 0 else 0
        e["sold_qty"] = round(e["sold_qty"], 3)

    rows = sorted(per_prod.values(), key=lambda x: -x["ideal"])

    total_real = round(sum(r["real"] for r in rows), 2)
    total_decomiso = round(sum(r["decomiso_loss"] for r in rows), 2)
    total_reclass = round(sum(r["reclass_loss"] for r in rows), 2)
    total_discount = round(sum(r["discount_loss"] for r in rows), 2)
    total_ideal = round(total_real + total_decomiso + total_reclass + total_discount, 2)

    return {
        "period_days": days,
        "total_real": total_real,
        "total_ideal": total_ideal,
        "total_decomiso_loss": total_decomiso,
        "total_reclass_loss": total_reclass,
        "total_discount_loss": total_discount,
        "total_gap": round(total_ideal - total_real, 2),
        "gap_pct": round(((total_ideal - total_real) / total_ideal * 100), 2) if total_ideal > 0 else 0,
        "by_product": rows,
    }


@api.get("/reports/product-analytics")
async def product_analytics(days: int = 30, user: dict = Depends(require("encargado"))):
    """Ventas, rentabilidad real, rotación y productos parados por producto."""
    start = _period_start(days)
    products = [p async for p in db.products.find({"active": True}, {"_id": 0})]
    now = datetime.now(timezone.utc)

    per_prod = {p["id"]: {
        "product_id": p["id"], "product_name": p["name"], "plu": p.get("plu"),
        "unit": p.get("unit", "kg"), "sale_price": float(p.get("sale_price", 0)),
        "average_cost": float(p.get("average_cost", 0)), "current_stock": float(p.get("current_stock", 0)),
        "sold_qty": 0, "sold_amount": 0, "sold_count": 0,
        "gross_profit": 0, "last_sold_at": None,
    } for p in products}

    sales_cursor = db.sales.find({"created_at": {"$gte": start}}, {"_id": 0}).sort("created_at", -1)
    async for s in sales_cursor:
        for it in s.get("items", []):
            if it.get("type") != "product":
                continue
            e = per_prod.get(it["ref_id"])
            if not e:
                continue
            q = float(it.get("quantity", 0))
            sub = float(it.get("subtotal", 0))
            e["sold_qty"] += q
            e["sold_amount"] += sub
            e["sold_count"] += 1
            e["gross_profit"] += sub - (e["average_cost"] * q)
            if not e["last_sold_at"] or s["created_at"] > e["last_sold_at"]:
                e["last_sold_at"] = s["created_at"]

    # Loss per product (net rentabilidad)
    losses = await report_losses(days=days, user=user)  # reuses aggregation
    loss_map = {r["product_id"]: r for r in losses["by_product"]}

    rows = []
    for pid, e in per_prod.items():
        loss = loss_map.get(pid, {})
        total_loss = float(loss.get("total_loss", 0))
        net_profit = round(e["gross_profit"] - total_loss, 2)
        rotation = round(e["sold_qty"] / days, 3) if days > 0 else 0
        days_since = None
        if e["last_sold_at"]:
            try:
                days_since = (now - datetime.fromisoformat(e["last_sold_at"].replace("Z", "+00:00"))).days
            except Exception:
                days_since = None
        e.update({
            "sold_qty": round(e["sold_qty"], 3),
            "sold_amount": round(e["sold_amount"], 2),
            "gross_profit": round(e["gross_profit"], 2),
            "total_loss": total_loss,
            "net_profit": net_profit,
            "rotation_per_day": rotation,
            "days_since_last_sale": days_since,
            "merma_pct": loss.get("merma_pct"),
        })
        rows.append(e)

    return {"period_days": days, "rows": rows}


@api.get("/reports/period-compare")
async def report_period_compare(days: int = 7, user: dict = Depends(require("encargado"))):
    """Comparativa: últimos N días vs N días anteriores."""
    now = datetime.now(timezone.utc)
    cur_start = now - timedelta(days=days)
    prev_start = now - timedelta(days=days*2)
    prev_end = cur_start

    async def _period_total(gte, lt):
        cursor = db.sales.find({"created_at": {"$gte": gte.isoformat(), "$lt": lt.isoformat()}}, {"_id": 0})
        total = 0; count = 0
        async for s in cursor:
            total += float(s.get("total", 0))
            count += 1
        return {"total": round(total, 2), "count": count, "avg": round(total/count, 2) if count else 0}

    cur = await _period_total(cur_start, now)
    prev = await _period_total(prev_start, prev_end)

    def _var(c, p):
        if p == 0:
            return None
        return round(((c - p) / p * 100), 2)

    return {
        "days": days,
        "current": cur,
        "previous": prev,
        "variation": {
            "total_pct": _var(cur["total"], prev["total"]),
            "count_pct": _var(cur["count"], prev["count"]),
            "avg_pct": _var(cur["avg"], prev["avg"]),
        },
    }


@api.get("/reports/heatmap")
async def report_heatmap(days: int = 30, user: dict = Depends(require("encargado"))):
    """Ventas por día de semana y por franja horaria."""
    start = _period_start(days)
    by_dow = [0]*7  # 0=Lunes
    by_hour = [0]*24
    dow_amount = [0.0]*7
    hour_amount = [0.0]*24
    cursor = db.sales.find({"created_at": {"$gte": start}}, {"_id": 0})
    async for s in cursor:
        try:
            dt = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
            dow = (dt.weekday())  # 0=Monday
            hour = dt.hour
            by_dow[dow] += 1
            by_hour[hour] += 1
            dow_amount[dow] += float(s.get("total", 0))
            hour_amount[hour] += float(s.get("total", 0))
        except Exception:
            pass
    names = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    return {
        "by_dow": [{"name": names[i], "count": by_dow[i], "amount": round(dow_amount[i], 2)} for i in range(7)],
        "by_hour": [{"hour": h, "count": by_hour[h], "amount": round(hour_amount[h], 2)} for h in range(24)],
    }


# ============================================================
# WEBSOCKET STUB (peso en vivo por puesto)
#
# ⚙ COSTURA A FUTURO:
# Un conversor Serial→WiFi (o app puente en Node/Electron) se conectará a este
# WebSocket y publicará el peso leído del display de la balanza. El cliente
# (tablet del puesto) recibirá pesos en vivo. Hoy sólo se acepta la conexión
# y se hace echo/broadcast, para dejar el canal listo.
# ============================================================
_ws_clients: dict = {}  # station_id -> set[WebSocket]


@app.websocket("/api/ws/scale/{station_id}")
async def ws_scale(ws: WebSocket, station_id: str):
    await ws.accept()
    _ws_clients.setdefault(station_id, set()).add(ws)
    try:
        while True:
            data = await ws.receive_json()
            # Broadcast the weight to all clients on this station
            dead = set()
            for c in _ws_clients.get(station_id, set()):
                try:
                    await c.send_json({"station_id": station_id, **data})
                except Exception:
                    dead.add(c)
            for d in dead:
                _ws_clients[station_id].discard(d)
    except WebSocketDisconnect:
        _ws_clients.get(station_id, set()).discard(ws)
    except Exception:
        _ws_clients.get(station_id, set()).discard(ws)



# ============================================================
# Mount and startup
# ============================================================
app.include_router(api)

# CORS_ORIGINS: lista separada por comas de orígenes permitidos, ej:
#   CORS_ORIGINS=http://192.168.1.50:3000,http://localhost:3000
# En desarrollo, si no se define, se permite todo para no trabar el trabajo local.
# En producción es OBLIGATORIO definirla (falla el arranque si no está).
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
if _cors_env:
    cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
elif IS_PRODUCTION:
    raise RuntimeError(
        "CORS_ORIGINS es obligatoria en producción. "
        "Definila en el .env con la IP local de la PC de la caja, ej: "
        "CORS_ORIGINS=http://192.168.1.50:3000"
    )
else:
    cors_origins = ["*"]
    logger.warning("CORS abierto a '*' (modo desarrollo). No usar así en el local del cliente.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    # Indexes
    # Migración: usuarios creados antes de separar username/email todavía no
    # tienen 'username' — se lo completamos con su email viejo para no romper
    # el índice único nuevo ni dejarlos sin poder loguearse.
    async for old_user in db.users.find({"username": {"$exists": False}}):
        await db.users.update_one(
            {"id": old_user["id"]},
            {"$set": {"username": (old_user.get("email") or old_user["id"]).lower()}},
        )

    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", unique=True, sparse=True)
    await db.products.create_index("name")
    await db.bags.create_index("code", unique=True)
    await db.bags.create_index("status")
    await db.orders.create_index("status")
    await db.sales.create_index("created_at")
    await db.stock_movements.create_index([("product_id", 1), ("created_at", -1)])

    # Seed admin
    admin_identifier = os.environ.get("ADMIN_EMAIL", "admin@bolsones.com").lower()
    admin_pass = os.environ.get("ADMIN_PASSWORD", "")
    if IS_PRODUCTION:
        if not admin_pass or admin_pass == "admin123":
            raise RuntimeError(
                "ADMIN_PASSWORD es obligatoria en producción y no puede ser 'admin123'. "
                "Definila en el .env antes de arrancar el server."
            )
    elif not admin_pass:
        admin_pass = "admin123"  # solo como fallback en desarrollo
        logger.warning("Usando ADMIN_PASSWORD por defecto 'admin123' (modo desarrollo).")

    existing = await db.users.find_one({"$or": [{"username": admin_identifier}, {"email": admin_identifier}]})
    if not existing:
        u = User(username=admin_identifier, email=admin_identifier, name="Administrador", role="admin").model_dump()
        u["password_hash"] = hash_password(admin_pass)
        await db.users.insert_one(u)
        logger.info(f"Admin creado: {admin_identifier}")
    else:
        if not verify_password(admin_pass, existing.get("password_hash", "")):
            await db.users.update_one({"id": existing["id"]}, {"$set": {"password_hash": hash_password(admin_pass)}})

    # Demo cashier/bag-builder y datos demo: SOLO fuera de producción,
    # para no dejar usuarios de prueba en el local del cliente.
    if not IS_PRODUCTION:
        for em, name, role, pwd, perms in [
            ("cajero@bolsones.com", "Sofía Cajera", "cajero", "cajero123", ["ventas"]),
            ("armador@bolsones.com", "Lucas Armador", "armador", "armador123", ["bolsones", "ventas"]),
        ]:
            ex = await db.users.find_one({"$or": [{"username": em}, {"email": em}]})
            if not ex:
                u = User(username=em, email=em, name=name, role=role, permissions=perms).model_dump()
                u["password_hash"] = hash_password(pwd)
                await db.users.insert_one(u)
            else:
                await db.users.update_one({"id": ex["id"]}, {"$set": {"permissions": perms}})

        try:
            await seed_demo_data(db)
            logger.info("Demo data seeded")
        except Exception as e:
            logger.error(f"Seed error: {e}")
    else:
        logger.info("ENVIRONMENT=production: se omiten usuarios demo y datos de ejemplo.")


@app.on_event("shutdown")
async def shutdown():
    client.close()
