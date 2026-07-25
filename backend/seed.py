"""Demo data seeder for BolsonesControl."""
from datetime import datetime, timezone, timedelta
from models import (
    Product, Supplier, Customer, BagType, RecipeItem, Bag, IngredientUsed,
    Purchase, PurchaseItem, Sale, SaleItem, Order, OrderItem,
    Employee, Expense, Waste, StockMovement, CashSession, CashMovement,
    BusinessConfig, CrateType, now_iso,
)
import random


async def seed_demo_data(db):
    """Seed initial demo data if collections are empty."""
    # BusinessConfig
    cfg = await db.business_config.find_one({"id": "main"}, {"_id": 0})
    if not cfg:
        await db.business_config.insert_one(BusinessConfig().model_dump())

    # Crate types (tara de cajones del mercado central)
    if await db.crate_types.count_documents({}) == 0:
        demo_crates = [
            {"name": "Cajón chico", "tare_kg": 1.5},
            {"name": "Cajón grande", "tare_kg": 3.0},
            {"name": "Bins", "tare_kg": 12.0},
        ]
        await db.crate_types.insert_many([CrateType(**c).model_dump() for c in demo_crates])

    # Products
    if await db.products.count_documents({}) == 0:
        demo_products = [
            {"name": "Papa", "plu": "1001", "category": "verdura", "unit": "kg", "sale_mode": "per_weight", "current_stock": 48, "minimum_stock": 10, "average_cost": 350, "sale_price": 700},
            {"name": "Cebolla", "plu": "1002", "category": "verdura", "unit": "kg", "sale_mode": "per_weight", "current_stock": 28, "minimum_stock": 8, "average_cost": 380, "sale_price": 750},
            {"name": "Zanahoria", "plu": "1003", "category": "verdura", "unit": "kg", "sale_mode": "per_weight", "current_stock": 22, "minimum_stock": 6, "average_cost": 420, "sale_price": 850},
            {"name": "Tomate", "plu": "1004", "category": "verdura", "unit": "kg", "sale_mode": "per_weight", "current_stock": 4, "minimum_stock": 8, "average_cost": 900, "sale_price": 1800},
            {"name": "Banana Ecuador premium", "plu": "1005", "category": "fruta", "unit": "kg", "sale_mode": "per_weight", "current_stock": 18, "minimum_stock": 5, "average_cost": 700, "sale_price": 1400},
            {"name": "Banana económica", "plu": "1015", "category": "fruta", "unit": "kg", "sale_mode": "per_weight", "current_stock": 0, "minimum_stock": 3, "average_cost": 700, "sale_price": 900},
            {"name": "Naranja", "plu": "1006", "category": "fruta", "unit": "kg", "sale_mode": "per_weight", "current_stock": 35, "minimum_stock": 10, "average_cost": 450, "sale_price": 950},
            {"name": "Manzana Roja", "plu": "1007", "category": "fruta", "unit": "kg", "sale_mode": "per_weight", "current_stock": 14, "minimum_stock": 6, "average_cost": 850, "sale_price": 1700},
            {"name": "Lechuga", "plu": "1008", "category": "verdura", "unit": "atado", "sale_mode": "per_unit", "current_stock": 12, "minimum_stock": 5, "average_cost": 600, "sale_price": 1200},
            {"name": "Acelga", "plu": "1009", "category": "verdura", "unit": "atado", "sale_mode": "per_unit", "current_stock": 9, "minimum_stock": 4, "average_cost": 500, "sale_price": 1000},
            {"name": "Zapallo Anco", "plu": "1010", "category": "verdura", "unit": "kg", "sale_mode": "per_weight", "current_stock": 16, "minimum_stock": 5, "average_cost": 550, "sale_price": 1100},
            {"name": "Bolsa Kraft", "plu": "9001", "category": "packaging", "unit": "unidad", "sale_mode": "per_unit", "current_stock": 250, "minimum_stock": 50, "average_cost": 80, "sale_price": 0},
        ]
        product_objs = [Product(**p) for p in demo_products]
        await db.products.insert_many([p.model_dump() for p in product_objs])
        product_map = {p.name: p for p in product_objs}
        # Set reclassification chain: premium -> económica
        prem = product_map.get("Banana Ecuador premium")
        econ = product_map.get("Banana económica")
        if prem and econ:
            await db.products.update_one({"id": prem.id}, {"$set": {"reclassification_target_id": econ.id}})
    else:
        cursor = db.products.find({}, {"_id": 0})
        product_map = {p["name"]: Product(**p) async for p in cursor}

    # Suppliers
    if await db.suppliers.count_documents({}) == 0:
        suppliers = [
            {"name": "Mercado Central", "phone": "+5491155551111", "address": "Av. Mercado 100, Mataderos", "type": "mercado"},
            {"name": "Quinta La Esperanza", "phone": "+5491155552222", "address": "Ruta 8 km 45, Pilar", "type": "quinta"},
            {"name": "Distribuidora Frutícola", "phone": "+5491155553333", "address": "Av. Frutícola 230", "type": "distribuidor"},
        ]
        await db.suppliers.insert_many([Supplier(**s).model_dump() for s in suppliers])

    # Customers
    if await db.customers.count_documents({}) == 0:
        customers = [
            {"name": "María González", "phone": "+5491155554444", "address": "Av. Corrientes 1234", "zone": "Centro", "frequent": True, "total_spent": 45000},
            {"name": "Juan Pérez", "phone": "+5491155555555", "address": "Calle 50 #200", "zone": "Norte", "total_spent": 12000},
            {"name": "Ana Martínez", "phone": "+5491155556666", "address": "Av. Belgrano 800", "zone": "Sur", "frequent": True, "total_spent": 87000},
            {"name": "Carlos López", "phone": "+5491155557777", "address": "San Martín 450", "zone": "Centro", "total_spent": 3500},
        ]
        await db.customers.insert_many([Customer(**c).model_dump() for c in customers])

    # Employees
    if await db.employees.count_documents({}) == 0:
        employees = [
            {"name": "Lucas Romero", "phone": "+5491155558888", "role": "armador", "payment_type": "semanal", "payment_amount": 80000},
            {"name": "Sofía Díaz", "phone": "+5491155559999", "role": "cajero", "payment_type": "mensual", "payment_amount": 350000},
            {"name": "Mateo Silva", "phone": "+5491155551010", "role": "repartidor", "payment_type": "dia", "payment_amount": 12000},
        ]
        await db.employees.insert_many([Employee(**e).model_dump() for e in employees])

    # Bag Types
    if await db.bag_types.count_documents({}) == 0:
        papa = product_map.get("Papa")
        cebolla = product_map.get("Cebolla")
        zanahoria = product_map.get("Zanahoria")
        banana = product_map.get("Banana Ecuador premium") or product_map.get("Banana")
        naranja = product_map.get("Naranja")
        manzana = product_map.get("Manzana Roja")
        acelga = product_map.get("Acelga")

        bag_types = []
        if all([papa, cebolla, zanahoria, banana, naranja]):
            bag_types.append(BagType(
                name="Bolsón Mixto Familiar",
                description="2kg papa, 1kg cebolla, 1kg zanahoria, 2kg naranja, 1kg banana",
                pricing_mode="fixed",
                fixed_price=15000,
                target_weight=7.5,
                recipe=[
                    RecipeItem(product_id=papa.id, product_name=papa.name, quantity=2, unit="kg"),
                    RecipeItem(product_id=cebolla.id, product_name=cebolla.name, quantity=1, unit="kg"),
                    RecipeItem(product_id=zanahoria.id, product_name=zanahoria.name, quantity=1, unit="kg"),
                    RecipeItem(product_id=naranja.id, product_name=naranja.name, quantity=2, unit="kg"),
                    RecipeItem(product_id=banana.id, product_name=banana.name, quantity=1, unit="kg"),
                ],
            ))
        if all([papa, cebolla, zanahoria, acelga]):
            bag_types.append(BagType(
                name="Bolsón Solo Verdura",
                description="Mix de verduras frescas",
                pricing_mode="fixed",
                fixed_price=11000,
                target_weight=5.5,
                recipe=[
                    RecipeItem(product_id=papa.id, product_name=papa.name, quantity=2, unit="kg"),
                    RecipeItem(product_id=cebolla.id, product_name=cebolla.name, quantity=1, unit="kg"),
                    RecipeItem(product_id=zanahoria.id, product_name=zanahoria.name, quantity=1, unit="kg"),
                    RecipeItem(product_id=acelga.id, product_name=acelga.name, quantity=1, unit="atado"),
                ],
            ))
        if all([banana, naranja, manzana]):
            bag_types.append(BagType(
                name="Bolsón Solo Fruta",
                description="Selección de frutas frescas",
                pricing_mode="fixed",
                fixed_price=13500,
                target_weight=6,
                recipe=[
                    RecipeItem(product_id=banana.id, product_name=banana.name, quantity=2, unit="kg"),
                    RecipeItem(product_id=naranja.id, product_name=naranja.name, quantity=2, unit="kg"),
                    RecipeItem(product_id=manzana.id, product_name=manzana.name, quantity=2, unit="kg"),
                ],
            ))
        bag_types.append(BagType(
            name="Bolsón Económico",
            description="Bolsón rendidor a precio accesible",
            pricing_mode="fixed",
            fixed_price=8500,
            target_weight=4,
            recipe=[],
        ))
        if bag_types:
            await db.bag_types.insert_many([b.model_dump() for b in bag_types])

    # Counters (for codes)
    if await db.counters.count_documents({"_id": "bag"}) == 0:
        await db.counters.insert_one({"_id": "bag", "seq": 0})
    if await db.counters.count_documents({"_id": "order"}) == 0:
        await db.counters.insert_one({"_id": "order", "seq": 0})

    # A couple of pre-armed bags as demo
    if await db.bags.count_documents({}) == 0:
        bt = await db.bag_types.find_one({"name": "Bolsón Mixto Familiar"}, {"_id": 0})
        if bt:
            for i in range(3):
                await db.counters.update_one({"_id": "bag"}, {"$inc": {"seq": 1}})
                ctr = await db.counters.find_one({"_id": "bag"})
                code = f"BOL-{ctr['seq']:06d}"
                bag = Bag(
                    code=code,
                    bag_type_id=bt["id"],
                    bag_type_name=bt["name"],
                    weight_kg=7.5 + random.uniform(-0.3, 0.5),
                    final_price=bt["fixed_price"],
                    estimated_cost=4200,
                    estimated_margin=bt["fixed_price"] - 4200,
                    status="disponible",
                    ingredients_used=[
                        IngredientUsed(product_id=r["product_id"], product_name=r["product_name"], quantity=r["quantity"], unit=r["unit"], cost=0)
                        for r in bt.get("recipe", [])
                    ],
                    created_by_name="Lucas Romero",
                )
                await db.bags.insert_one(bag.model_dump())

    # Demo expenses
    if await db.expenses.count_documents({}) == 0:
        today = datetime.now(timezone.utc)
        expenses = [
            {"description": "Alquiler local", "category": "alquiler", "amount": 280000, "type": "fijo", "payment_status": "pagado", "date": (today - timedelta(days=2)).isoformat()},
            {"description": "Luz y gas", "category": "servicios", "amount": 45000, "type": "fijo", "payment_status": "pendiente", "date": (today - timedelta(days=5)).isoformat()},
            {"description": "Combustible reparto", "category": "combustible", "amount": 18000, "type": "variable", "payment_status": "pagado", "date": today.isoformat()},
        ]
        await db.expenses.insert_many([Expense(**e).model_dump() for e in expenses])

    # Demo waste
    if await db.waste.count_documents({}) == 0:
        tomate = product_map.get("Tomate")
        if tomate:
            await db.waste.insert_one(Waste(
                product_id=tomate.id,
                product_name=tomate.name,
                quantity=2.5,
                unit="kg",
                reason="podrido",
                estimated_cost=2250,
                user_name="Sofía Díaz",
            ).model_dump())

    # Demo orders
    if await db.orders.count_documents({}) == 0:
        bt = await db.bag_types.find_one({"name": "Bolsón Mixto Familiar"}, {"_id": 0})
        cust = await db.customers.find_one({"name": "María González"}, {"_id": 0})
        if bt and cust:
            await db.counters.update_one({"_id": "order"}, {"$inc": {"seq": 1}})
            ctr = await db.counters.find_one({"_id": "order"})
            order = Order(
                code=f"PED-{ctr['seq']:06d}",
                customer_id=cust["id"],
                customer_name=cust["name"],
                customer_phone=cust.get("phone"),
                delivery_type="envio",
                address=cust.get("address"),
                zone=cust.get("zone"),
                scheduled_date=datetime.now(timezone.utc).isoformat(),
                time_slot="16:00 - 18:00",
                items=[OrderItem(type="bag_type", ref_id=bt["id"], name=bt["name"], quantity=2, unit_price=bt["fixed_price"], subtotal=2*bt["fixed_price"])],
                total=2*bt["fixed_price"],
                status="pendiente",
                source="whatsapp",
            )
            await db.orders.insert_one(order.model_dump())
