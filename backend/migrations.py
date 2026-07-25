"""On-startup non-destructive migrations for BolsonesControl v2 (greengrocery mode)."""
import logging

logger = logging.getLogger("bolsones.migrations")


async def next_counter(db, name: str) -> int:
    res = await db.counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return (res or {}).get("seq", 1)


async def migrate_products(db):
    """Add PLU + sale_mode + reclassification_target_id to existing products without touching data."""
    cursor = db.products.find({}, {"_id": 0})
    migrated = 0
    async for p in cursor:
        update = {}
        if not p.get("plu"):
            seq = await next_counter(db, "plu")
            update["plu"] = str(1000 + seq)
        if not p.get("sale_mode"):
            update["sale_mode"] = "per_weight" if p.get("unit") == "kg" else "per_unit"
        if "reclassification_target_id" not in p:
            update["reclassification_target_id"] = None
        if update:
            await db.products.update_one({"id": p["id"]}, {"$set": update})
            migrated += 1
    if migrated:
        logger.info(f"Migración de productos: {migrated} actualizados")


async def seed_stations(db):
    """Create default sales stations if not present."""
    if await db.sales_stations.count_documents({}) == 0:
        await db.sales_stations.insert_many([
            {"id": "balanza-1", "name": "Balanza 1", "kind": "balanza", "active": True, "created_at": ""},
            {"id": "balanza-2", "name": "Balanza 2", "kind": "balanza", "active": True, "created_at": ""},
            {"id": "caja-1", "name": "Caja Principal", "kind": "caja", "active": True, "created_at": ""},
        ])
        logger.info("Puestos de venta creados: Balanza 1, Balanza 2, Caja Principal")


async def run_all(db):
    await migrate_products(db)
    await seed_stations(db)
