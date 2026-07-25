"""BolsonesControl backend integration tests."""
import os
import pytest
import requests


BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@bolsones.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def cajero_token():
    r = requests.post(f"{API}/auth/login", json={"email": "cajero@bolsones.com", "password": "cajero123"})
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def armador_token():
    r = requests.post(f"{API}/auth/login", json={"email": "armador@bolsones.com", "password": "armador123"})
    assert r.status_code == 200
    return r.json()["access_token"]


def ensure_stock(product_id, min_qty, admin_headers):
    """Repone stock vía una compra si el producto tiene menos de min_qty.
    La suite corre muchas veces contra el mismo Mongo persistente, así que
    productos con poco stock inicial (ej. Banana) se agotan con el tiempo
    si no se reponen antes de usarlos."""
    prod = requests.get(f"{API}/products/{product_id}", headers=admin_headers).json()
    current = float(prod.get("current_stock", 0))
    if current < min_qty:
        need = round(min_qty - current + 10, 2)  # margen extra
        cost = prod.get("average_cost") or 100
        requests.post(f"{API}/purchases", json={
            "items": [{"product_id": product_id, "unit": prod.get("unit", "kg"),
                       "quantity": need, "kg_equivalent": need,
                       "unit_cost": cost, "total_cost": round(need * cost, 2)}],
            "payment_method": "efectivo", "payment_status": "pagado",
        }, headers=admin_headers)


def ensure_recipe_stock(bag_type, admin_headers):
    """Asegura stock suficiente de cada ingrediente de la receta de un bag_type
    antes de intentar armarlo, con margen para varios armados seguidos."""
    for ri in bag_type["recipe"]:
        ensure_stock(ri["product_id"], ri["quantity"] * 3, admin_headers)


# ============== AUTH ==============
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@bolsones.com", "password": "admin123"})
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d and "user" in d
        assert d["user"]["email"] == "admin@bolsones.com"
        assert d["user"]["role"] == "admin"
        # cookies
        assert "access_token" in r.cookies

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@bolsones.com", "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_bearer(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == "admin@bolsones.com"

    def test_me_with_cookie(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": "admin@bolsones.com", "password": "admin123"})
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200


# ============== SEED DATA ==============
class TestSeed:
    def test_products_seeded(self, admin_headers):
        r = requests.get(f"{API}/products", headers=admin_headers)
        assert r.status_code == 200
        products = r.json()
        assert len(products) >= 10
        names = {p["name"] for p in products}
        for required in ["Papa", "Cebolla", "Banana", "Tomate"]:
            assert required in names, f"Missing {required}"

    def test_suppliers_seeded(self, admin_headers):
        r = requests.get(f"{API}/suppliers", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_customers_seeded(self, admin_headers):
        r = requests.get(f"{API}/customers", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 4

    def test_bag_types_seeded(self, admin_headers):
        r = requests.get(f"{API}/bag-types", headers=admin_headers)
        assert r.status_code == 200
        bts = r.json()
        assert len(bts) >= 3
        mixto = next((b for b in bts if b["name"] == "Bolsón Mixto Familiar"), None)
        assert mixto is not None
        assert len(mixto["recipe"]) > 0

    def test_bags_seeded(self, admin_headers):
        r = requests.get(f"{API}/bags", headers=admin_headers)
        assert r.status_code == 200
        bags = r.json()
        codes = [b["code"] for b in bags]
        assert any(c.startswith("BOL-") for c in codes)


# ============== PURCHASES ==============
class TestPurchases:
    def test_create_purchase_updates_stock(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        old_stock = float(papa["current_stock"])
        sup = requests.get(f"{API}/suppliers", headers=admin_headers).json()[0]

        payload = {
            "supplier_id": sup["id"],
            "items": [{
                "product_id": papa["id"], "quantity": 20, "unit": "kg",
                "kg_equivalent": 20, "unit_cost": 400, "total_cost": 8000,
            }],
            "payment_method": "efectivo", "payment_status": "pagado",
        }
        r = requests.post(f"{API}/purchases", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 8000.0

        # Verify stock
        r2 = requests.get(f"{API}/products/{papa['id']}", headers=admin_headers)
        assert r2.status_code == 200
        new_stock = float(r2.json()["current_stock"])
        assert new_stock == old_stock + 20


# ============== CRATE TYPES (tara de cajones) ==============
class TestCrateTypes:
    new_crate_id = None

    def test_seed_crate_types_present(self, admin_headers):
        r = requests.get(f"{API}/crate-types", headers=admin_headers)
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        for required in ["Cajón chico", "Cajón grande", "Bins"]:
            assert required in names, f"Falta {required}"

    def test_create_crate_type(self, admin_headers):
        r = requests.post(f"{API}/crate-types", json={"name": "TEST_Cajon", "tare_kg": 2.5},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["tare_kg"] == 2.5
        TestCrateTypes.new_crate_id = d["id"]

    def test_update_crate_type_tare(self, admin_headers):
        assert TestCrateTypes.new_crate_id
        r = requests.patch(f"{API}/crate-types/{TestCrateTypes.new_crate_id}",
                           json={"tare_kg": 3.1}, headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["tare_kg"] == 3.1

    def test_active_only_filter(self, admin_headers):
        r = requests.get(f"{API}/crate-types", params={"active_only": True}, headers=admin_headers)
        assert r.status_code == 200
        assert all(c["active"] for c in r.json())

    def test_purchase_with_crate_weighing_computes_net_kg(self, admin_headers):
        """Simula: 3 cajones chicos (tara 1.5kg c/u) de tomate, peso bruto 22kg,
        pagados $15000 en total -> neto = 22 - 3*1.5 = 17.5kg, costo/kg = 15000/17.5."""
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        tomate = next(p for p in prods if p["name"] == "Tomate")
        before_stock = float(tomate["current_stock"])

        crates = requests.get(f"{API}/crate-types", headers=admin_headers).json()
        chico = next(c for c in crates if c["name"] == "Cajón chico")

        gross = 22.0
        count = 3
        total_cost = 15000.0
        net_kg = round(gross - chico["tare_kg"] * count, 2)  # 17.5

        payload = {
            "items": [{
                "product_id": tomate["id"], "unit": "kg",
                "quantity": net_kg, "kg_equivalent": net_kg,
                "unit_cost": round(total_cost / net_kg, 2), "total_cost": total_cost,
                "crate_type_id": chico["id"], "crate_type_name": chico["name"],
                "crate_count": count, "gross_weight": gross,
            }],
            "payment_method": "efectivo", "payment_status": "pagado",
        }
        r = requests.post(f"{API}/purchases", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text

        after_stock = float(requests.get(f"{API}/products/{tomate['id']}", headers=admin_headers).json()["current_stock"])
        assert round(after_stock, 2) == round(before_stock + net_kg, 2)

        # El detalle de trazabilidad del cajón queda guardado en la compra
        saved = requests.get(f"{API}/purchases", headers=admin_headers).json()[0]
        saved_item = saved["items"][0]
        assert saved_item["crate_type_name"] == "Cajón chico"
        assert saved_item["crate_count"] == count
        assert saved_item["gross_weight"] == gross


# ============== BAG TYPES ==============
class TestBagTypes:
    def test_create_and_update(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        payload = {
            "name": "TEST_BolsonTest", "pricing_mode": "fixed", "fixed_price": 5000,
            "target_weight": 3,
            "recipe": [{"product_id": papa["id"], "quantity": 1, "unit": "kg"}],
        }
        r = requests.post(f"{API}/bag-types", json=payload, headers=admin_headers)
        assert r.status_code == 200
        bid = r.json()["id"]
        # update
        r2 = requests.patch(f"{API}/bag-types/{bid}", json={"fixed_price": 6000}, headers=admin_headers)
        assert r2.status_code == 200
        assert r2.json()["fixed_price"] == 6000


# ============== BAG BUILD ==============
class TestBagBuild:
    bag_id = None
    bag_code = None

    def test_build_bag_success(self, admin_headers):
        bts = requests.get(f"{API}/bag-types", headers=admin_headers).json()
        bt = next(b for b in bts if b["name"] == "Bolsón Mixto Familiar")
        ensure_recipe_stock(bt, admin_headers)
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        prods_map = {p["id"]: p for p in prods}

        # Snapshot stocks
        before_stocks = {r["product_id"]: float(prods_map[r["product_id"]]["current_stock"]) for r in bt["recipe"]}

        ingredients = [{"product_id": r["product_id"], "product_name": r["product_name"],
                        "quantity": r["quantity"], "unit": r["unit"], "cost": 0} for r in bt["recipe"]]
        payload = {"bag_type_id": bt["id"], "weight_kg": 7.5, "ingredients_used": ingredients}
        r = requests.post(f"{API}/bags/build", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["code"].startswith("BOL-")
        assert d["status"] == "disponible"
        TestBagBuild.bag_id = d["id"]
        TestBagBuild.bag_code = d["code"]

        # Verify stock dropped
        new_prods = {p["id"]: p for p in requests.get(f"{API}/products", headers=admin_headers).json()}
        for r_item in bt["recipe"]:
            after = float(new_prods[r_item["product_id"]]["current_stock"])
            assert after == before_stocks[r_item["product_id"]] - r_item["quantity"]

    def test_build_insufficient_stock(self, admin_headers):
        bts = requests.get(f"{API}/bag-types", headers=admin_headers).json()
        bt = next(b for b in bts if b["name"] == "Bolsón Mixto Familiar")
        ingredients = [{"product_id": r["product_id"], "product_name": r["product_name"],
                        "quantity": 99999, "unit": r["unit"], "cost": 0} for r in bt["recipe"][:1]]
        payload = {"bag_type_id": bt["id"], "weight_kg": 7.5, "ingredients_used": ingredients}
        r = requests.post(f"{API}/bags/build", json=payload, headers=admin_headers)
        assert r.status_code == 400

    def test_bag_by_code(self, admin_headers):
        assert TestBagBuild.bag_code
        r = requests.get(f"{API}/bags/by-code/{TestBagBuild.bag_code}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["code"] == TestBagBuild.bag_code


# ============== SALES ==============
class TestSales:
    def test_open_cash_if_needed(self, admin_headers):
        cur = requests.get(f"{API}/cash/current", headers=admin_headers).json()
        if not cur:
            r = requests.post(f"{API}/cash/open", json={"initial_amount": 5000}, headers=admin_headers)
            assert r.status_code == 200

    def test_cash_open_twice_fails(self, admin_headers):
        r = requests.post(f"{API}/cash/open", json={"initial_amount": 5000}, headers=admin_headers)
        assert r.status_code == 400

    def test_sell_bag(self, admin_headers):
        assert TestBagBuild.bag_id
        bag = requests.get(f"{API}/bags/{TestBagBuild.bag_id}", headers=admin_headers).json()
        payload = {
            "items": [{
                "type": "bag", "ref_id": bag["id"], "name": bag["bag_type_name"],
                "code": bag["code"], "quantity": 1, "unit": "unidad",
                "unit_price": bag["final_price"], "subtotal": bag["final_price"],
            }],
            "payment_method": "efectivo",
        }
        r = requests.post(f"{API}/sales", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        # Verify bag marked sold
        b = requests.get(f"{API}/bags/{bag['id']}", headers=admin_headers).json()
        assert b["status"] == "vendido"

    def test_sell_already_sold_bag_fails(self, admin_headers):
        assert TestBagBuild.bag_id
        bag = requests.get(f"{API}/bags/{TestBagBuild.bag_id}", headers=admin_headers).json()
        payload = {
            "items": [{"type": "bag", "ref_id": bag["id"], "name": bag["bag_type_name"],
                       "code": bag["code"], "quantity": 1, "unit": "unidad",
                       "unit_price": bag["final_price"], "subtotal": bag["final_price"]}],
            "payment_method": "efectivo",
        }
        r = requests.post(f"{API}/sales", json=payload, headers=admin_headers)
        assert r.status_code == 400

    def test_sell_product(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        before = float(papa["current_stock"])
        payload = {
            "items": [{"type": "product", "ref_id": papa["id"], "name": "Papa",
                       "quantity": 1, "unit": "kg", "unit_price": 700, "subtotal": 700}],
            "payment_method": "efectivo",
        }
        r = requests.post(f"{API}/sales", json=payload, headers=admin_headers)
        assert r.status_code == 200
        after = float(requests.get(f"{API}/products/{papa['id']}", headers=admin_headers).json()["current_stock"])
        assert after == before - 1

    def test_sale_rollback_on_partial_failure(self, admin_headers):
        """Si un ítem de la venta falla (stock insuficiente), el/los ítems previos
        ya aplicados en la misma venta deben revertirse (stock y bolsones)."""
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        before = float(papa["current_stock"])
        payload = {
            "items": [
                {"type": "product", "ref_id": papa["id"], "name": "Papa",
                 "quantity": 1, "unit": "kg", "unit_price": 700, "subtotal": 700},
                {"type": "product", "ref_id": papa["id"], "name": "Papa",
                 "quantity": before + 9999, "unit": "kg", "unit_price": 700, "subtotal": 700},
            ],
            "payment_method": "efectivo",
        }
        r = requests.post(f"{API}/sales", json=payload, headers=admin_headers)
        assert r.status_code == 400
        after = float(requests.get(f"{API}/products/{papa['id']}", headers=admin_headers).json()["current_stock"])
        assert after == before, "El stock del primer ítem debe quedar revertido tras el fallo del segundo"

    def test_sell_same_bag_concurrently_only_one_succeeds(self, admin_headers):
        """Dos ventas simultáneas del mismo bolsón: solo una debe prosperar."""
        import concurrent.futures
        bts = requests.get(f"{API}/bag-types", headers=admin_headers).json()
        bt = next(b for b in bts if b["name"] == "Bolsón Mixto Familiar")
        ensure_recipe_stock(bt, admin_headers)
        ingredients = [{"product_id": ri["product_id"], "product_name": ri["product_name"],
                        "quantity": ri["quantity"], "unit": ri["unit"], "cost": 0} for ri in bt["recipe"]]
        build_payload = {"bag_type_id": bt["id"], "weight_kg": 7.5, "ingredients_used": ingredients}
        rb = requests.post(f"{API}/bags/build", json=build_payload, headers=admin_headers)
        assert rb.status_code == 200, rb.text
        bag = rb.json()

        def _vender():
            payload = {
                "items": [{"type": "bag", "ref_id": bag["id"], "name": bag.get("bag_type_name", ""),
                           "code": bag["code"], "quantity": 1, "unit": "unidad",
                           "unit_price": bag["final_price"], "subtotal": bag["final_price"]}],
                "payment_method": "efectivo",
            }
            return requests.post(f"{API}/sales", json=payload, headers=admin_headers).status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            results = list(ex.map(lambda _: _vender(), range(2)))
        assert results.count(200) == 1, f"Debe ganar exactamente una venta, resultado: {results}"
        assert results.count(400) == 1


# ============== TICKETS (venta en curso / puestos de balanza) ==============
class TestTickets:
    station_id = None
    ticket_id = None

    def test_create_station(self, admin_headers):
        r = requests.post(f"{API}/stations", json={"name": "Balanza Test 1", "kind": "balanza"},
                           headers=admin_headers)
        assert r.status_code == 200, r.text
        TestTickets.station_id = r.json()["id"]

    def test_list_stations_includes_new(self, admin_headers):
        r = requests.get(f"{API}/stations", headers=admin_headers)
        assert r.status_code == 200
        assert any(s["id"] == TestTickets.station_id for s in r.json())

    def test_create_ticket_invalid_station_fails(self, admin_headers):
        r = requests.post(f"{API}/tickets", json={"station_id": "no-existe"}, headers=admin_headers)
        assert r.status_code == 404

    def test_create_ticket(self, admin_headers):
        r = requests.post(f"{API}/tickets", json={"station_id": TestTickets.station_id}, headers=admin_headers)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["status"] == "abierto"
        assert t["items"] == []
        assert t["code"].startswith("TKT-")
        TestTickets.ticket_id = t["id"]

    def test_add_product_item_by_id(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        r = requests.post(f"{API}/tickets/{TestTickets.ticket_id}/items",
                           json={"type": "product", "ref_id": papa["id"], "quantity": 2.5},
                           headers=admin_headers)
        assert r.status_code == 200, r.text
        t = r.json()
        assert len(t["items"]) == 1
        item = t["items"][0]
        assert item["quantity"] == 2.5
        assert item["unit_price"] == papa["sale_price"]
        assert item["subtotal_full"] == round(2.5 * papa["sale_price"], 2)
        assert t["total"] == item["subtotal"]

    def test_add_product_item_by_plu(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        naranja = next(p for p in prods if p["name"] == "Naranja")
        r = requests.post(f"{API}/tickets/{TestTickets.ticket_id}/items",
                           json={"type": "product", "ref_id": naranja["plu"], "quantity": 1,
                                 "discount_type": "percent", "discount_value": 10},
                           headers=admin_headers)
        assert r.status_code == 200, r.text
        t = r.json()
        item = next(i for i in t["items"] if i["ref_id"] == naranja["id"])
        expected_full = round(1 * naranja["sale_price"], 2)
        expected_disc = round(expected_full * 0.10, 2)
        assert item["discount_amount"] == expected_disc
        assert item["subtotal"] == round(expected_full - expected_disc, 2)

    def test_add_item_unknown_product_fails(self, admin_headers):
        r = requests.post(f"{API}/tickets/{TestTickets.ticket_id}/items",
                           json={"type": "product", "ref_id": "no-existe", "quantity": 1},
                           headers=admin_headers)
        assert r.status_code == 404

    def test_update_ticket_item_quantity(self, admin_headers):
        t = requests.get(f"{API}/tickets/{TestTickets.ticket_id}", headers=admin_headers).json()
        item = t["items"][0]  # Papa
        r = requests.patch(f"{API}/tickets/{TestTickets.ticket_id}/items/{item['id']}",
                            json={"quantity": 5}, headers=admin_headers)
        assert r.status_code == 200, r.text
        updated = next(i for i in r.json()["items"] if i["id"] == item["id"])
        assert updated["quantity"] == 5
        assert updated["subtotal_full"] == round(5 * updated["unit_price"], 2)

    def test_remove_ticket_item(self, admin_headers):
        t = requests.get(f"{API}/tickets/{TestTickets.ticket_id}", headers=admin_headers).json()
        n_before = len(t["items"])
        item_id = t["items"][-1]["id"]  # Naranja (con descuento)
        r = requests.delete(f"{API}/tickets/{TestTickets.ticket_id}/items/{item_id}", headers=admin_headers)
        assert r.status_code == 200, r.text
        t2 = r.json()
        assert len(t2["items"]) == n_before - 1
        assert t2["total"] == t2["items"][0]["subtotal"]

    def test_send_empty_ticket_fails(self, admin_headers):
        r = requests.post(f"{API}/tickets", json={"station_id": TestTickets.station_id}, headers=admin_headers)
        empty_id = r.json()["id"]
        r2 = requests.post(f"{API}/tickets/{empty_id}/send", headers=admin_headers)
        assert r2.status_code == 400
        requests.post(f"{API}/tickets/{empty_id}/cancel", headers=admin_headers)  # limpieza

    def test_send_ticket_to_cashier(self, admin_headers):
        r = requests.post(f"{API}/tickets/{TestTickets.ticket_id}/send", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pendiente_caja"

    def test_cannot_edit_after_sent(self, admin_headers):
        r = requests.post(f"{API}/tickets/{TestTickets.ticket_id}/items",
                           json={"type": "product", "ref_id": "x", "quantity": 1}, headers=admin_headers)
        assert r.status_code == 400

    def test_confirm_ticket_creates_sale_and_discounts_stock(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        before = float(papa["current_stock"])
        t_before = requests.get(f"{API}/tickets/{TestTickets.ticket_id}", headers=admin_headers).json()
        qty_papa = next(i["quantity"] for i in t_before["items"] if i["ref_id"] == papa["id"])

        r = requests.post(f"{API}/tickets/{TestTickets.ticket_id}/confirm",
                           json={"payment_method": "efectivo"}, headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ticket"]["status"] == "cobrado"
        assert body["sale"]["id"]
        assert body["sale"]["total"] == t_before["total"]

        after = float(requests.get(f"{API}/products/{papa['id']}", headers=admin_headers).json()["current_stock"])
        assert after == before - qty_papa

    def test_confirm_already_confirmed_fails(self, admin_headers):
        r = requests.post(f"{API}/tickets/{TestTickets.ticket_id}/confirm",
                           json={"payment_method": "efectivo"}, headers=admin_headers)
        assert r.status_code == 400

    def test_cancel_ticket(self, admin_headers):
        r = requests.post(f"{API}/tickets", json={"station_id": TestTickets.station_id}, headers=admin_headers)
        tid = r.json()["id"]
        r2 = requests.post(f"{API}/tickets/{tid}/cancel", headers=admin_headers)
        assert r2.status_code == 200
        t = requests.get(f"{API}/tickets/{tid}", headers=admin_headers).json()
        assert t["status"] == "cancelado"

    def test_cannot_cancel_confirmed_ticket(self, admin_headers):
        r = requests.post(f"{API}/tickets/{TestTickets.ticket_id}/cancel", headers=admin_headers)
        assert r.status_code == 400

    def test_confirm_ticket_rollback_on_insufficient_stock(self, admin_headers):
        r = requests.post(f"{API}/tickets", json={"station_id": TestTickets.station_id}, headers=admin_headers)
        tid = r.json()["id"]
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        before = float(papa["current_stock"])

        requests.post(f"{API}/tickets/{tid}/items",
                      json={"type": "product", "ref_id": papa["id"], "quantity": 1}, headers=admin_headers)
        requests.post(f"{API}/tickets/{tid}/items",
                      json={"type": "product", "ref_id": papa["id"], "quantity": before + 9999},
                      headers=admin_headers)

        r2 = requests.post(f"{API}/tickets/{tid}/confirm", json={"payment_method": "efectivo"},
                           headers=admin_headers)
        assert r2.status_code == 400
        after = float(requests.get(f"{API}/products/{papa['id']}", headers=admin_headers).json()["current_stock"])
        assert after == before, "El stock debe quedar sin cambios tras el fallo de confirmación"

        t = requests.get(f"{API}/tickets/{tid}", headers=admin_headers).json()
        assert t["status"] != "cobrado"

    def test_confirm_ticket_with_bag(self, admin_headers):
        bts = requests.get(f"{API}/bag-types", headers=admin_headers).json()
        bt = next(b for b in bts if b["name"] == "Bolsón Mixto Familiar")
        ensure_recipe_stock(bt, admin_headers)
        ingredients = [{"product_id": ri["product_id"], "product_name": ri["product_name"],
                        "quantity": ri["quantity"], "unit": ri["unit"], "cost": 0} for ri in bt["recipe"]]
        rb = requests.post(f"{API}/bags/build",
                           json={"bag_type_id": bt["id"], "weight_kg": 7.5, "ingredients_used": ingredients},
                           headers=admin_headers)
        assert rb.status_code == 200, rb.text
        bag = rb.json()

        r = requests.post(f"{API}/tickets", json={"station_id": TestTickets.station_id}, headers=admin_headers)
        tid = r.json()["id"]
        ri = requests.post(f"{API}/tickets/{tid}/items",
                           json={"type": "bag", "ref_id": bag["code"], "quantity": 1}, headers=admin_headers)
        assert ri.status_code == 200, ri.text

        rc = requests.post(f"{API}/tickets/{tid}/confirm", json={"payment_method": "efectivo"},
                           headers=admin_headers)
        assert rc.status_code == 200, rc.text

        bag_after = requests.get(f"{API}/bags/{bag['id']}", headers=admin_headers).json()
        assert bag_after["status"] == "vendido"

    def test_confirm_ticket_bag_already_sold_fails(self, admin_headers):
        # Reintenta cargar a un ticket un bolsón que ya se vendió en el test anterior
        bags = requests.get(f"{API}/bags", headers=admin_headers).json()
        sold_bag = next(b for b in bags if b["status"] == "vendido")
        r = requests.post(f"{API}/tickets", json={"station_id": TestTickets.station_id}, headers=admin_headers)
        tid = r.json()["id"]
        ri = requests.post(f"{API}/tickets/{tid}/items",
                           json={"type": "bag", "ref_id": sold_bag["code"], "quantity": 1}, headers=admin_headers)
        assert ri.status_code == 400


# ============== CASH ==============
class TestCash:
    def test_movement(self, admin_headers):
        r = requests.post(f"{API}/cash/movement",
                          json={"type": "ingreso", "amount": 1000, "description": "Test", "method": "efectivo"},
                          headers=admin_headers)
        assert r.status_code == 200


# ============== ORDERS ==============
class TestOrders:
    order_id = None

    def test_create_order(self, admin_headers):
        bts = requests.get(f"{API}/bag-types", headers=admin_headers).json()
        bt = bts[0]
        payload = {
            "customer_name": "TEST_Cliente", "customer_phone": "+5491100000000",
            "delivery_type": "retiro",
            "items": [{"type": "bag_type", "ref_id": bt["id"], "name": bt["name"],
                       "quantity": 1, "unit_price": bt["fixed_price"], "subtotal": bt["fixed_price"]}],
            "total": bt["fixed_price"],
        }
        r = requests.post(f"{API}/orders", json=payload, headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["code"].startswith("PED-")
        TestOrders.order_id = d["id"]

    def test_update_order_status(self, admin_headers):
        assert TestOrders.order_id
        r = requests.patch(f"{API}/orders/{TestOrders.order_id}",
                           json={"status": "confirmado"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "confirmado"

    def test_public_order(self):
        cat = requests.get(f"{API}/public/catalog").json()
        bt = cat["bag_types"][0]
        valid_date = requests.get(f"{API}/orders/next-delivery-dates").json()["dates"][0]
        payload = {
            "customer_name": "TEST_Publico", "customer_phone": "+5491100000001",
            "delivery_type": "retiro", "scheduled_date": valid_date, "payment_method": "efectivo",
            "items": [{"type": "bag_type", "ref_id": bt["id"], "name": bt["name"],
                       "quantity": 1, "unit_price": bt["fixed_price"], "subtotal": bt["fixed_price"]}],
            "total": bt["fixed_price"],
        }
        r = requests.post(f"{API}/public/orders", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["code"].startswith("PED-")

    def test_public_order_without_date_fails(self):
        cat = requests.get(f"{API}/public/catalog").json()
        bt = cat["bag_types"][0]
        payload = {
            "customer_name": "TEST_SinFecha", "customer_phone": "+5491100000002",
            "delivery_type": "retiro",
            "items": [{"type": "bag_type", "ref_id": bt["id"], "name": bt["name"],
                       "quantity": 1, "unit_price": bt["fixed_price"], "subtotal": bt["fixed_price"]}],
            "total": bt["fixed_price"],
        }
        r = requests.post(f"{API}/public/orders", json=payload)
        assert r.status_code == 400

    def test_public_order_invalid_weekday_fails(self):
        cat = requests.get(f"{API}/public/catalog").json()
        bt = cat["bag_types"][0]
        payload = {
            "customer_name": "TEST_DiaInvalido", "customer_phone": "+5491100000003",
            "delivery_type": "retiro", "scheduled_date": "2020-01-01",  # miércoles, no es día de reparto
            "items": [{"type": "bag_type", "ref_id": bt["id"], "name": bt["name"],
                       "quantity": 1, "unit_price": bt["fixed_price"], "subtotal": bt["fixed_price"]}],
            "total": bt["fixed_price"],
        }
        r = requests.post(f"{API}/public/orders", json=payload)
        assert r.status_code == 400

    def test_public_order_loose_products_below_minimum_fails(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        valid_date = requests.get(f"{API}/orders/next-delivery-dates").json()["dates"][0]
        payload = {
            "customer_name": "TEST_BajoMinimo", "customer_phone": "+5491100000004",
            "delivery_type": "retiro", "scheduled_date": valid_date, "payment_method": "efectivo",
            "items": [{"type": "product", "ref_id": papa["id"], "name": "Papa",
                       "quantity": 2, "unit": "kg", "unit_price": 700, "subtotal": 1400}],
            "total": 1400,
        }
        r = requests.post(f"{API}/public/orders", json=payload)
        assert r.status_code == 400

    def test_public_order_loose_products_meets_minimum_by_kg(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        valid_date = requests.get(f"{API}/orders/next-delivery-dates").json()["dates"][0]
        payload = {
            "customer_name": "TEST_CumpleMinimo", "customer_phone": "+5491100000005",
            "delivery_type": "retiro", "scheduled_date": valid_date, "payment_method": "transferencia",
            "items": [{"type": "product", "ref_id": papa["id"], "name": "Papa",
                       "quantity": 9, "unit": "kg", "unit_price": 700, "subtotal": 6300}],
            "total": 6300,
        }
        r = requests.post(f"{API}/public/orders", json=payload)
        assert r.status_code == 200, r.text

    def test_public_catalog(self):
        r = requests.get(f"{API}/public/catalog")

    def test_public_catalog(self):
        r = requests.get(f"{API}/public/catalog")
        assert r.status_code == 200
        d = r.json()
        assert "business" in d and "bag_types" in d
        assert d["business"]["name"]


# ============== WASTE ==============
class TestWaste:
    def test_create_waste(self, admin_headers):
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        p = next(x for x in prods if x["name"] == "Cebolla")
        before = float(p["current_stock"])
        payload = {"product_id": p["id"], "quantity": 1, "unit": "kg",
                   "reason": "podrido", "estimated_cost": 380}
        r = requests.post(f"{API}/waste", json=payload, headers=admin_headers)
        assert r.status_code == 200
        after = float(requests.get(f"{API}/products/{p['id']}", headers=admin_headers).json()["current_stock"])
        assert after == before - 1


# ============== REPORTS ==============
class TestReports:
    def test_dashboard(self, admin_headers):
        r = requests.get(f"{API}/dashboard", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["sales_today_total", "low_stock_count", "alerts", "bags_available"]:
            assert k in d

    def test_reports_sales(self, admin_headers):
        r = requests.get(f"{API}/reports/sales?days=7", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["series", "by_method", "top_bags", "top_products", "total"]:
            assert k in d

    def test_reports_stock(self, admin_headers):
        r = requests.get(f"{API}/reports/stock", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "total_value" in d and "low_stock" in d


# ============== CONFIG ==============
class TestConfig:
    def test_get_and_update(self, admin_headers):
        r = requests.get(f"{API}/config", headers=admin_headers)
        assert r.status_code == 200
        original = r.json()["business_name"]
        r2 = requests.put(f"{API}/config", json={"business_name": "TEST_BolsonesNuevo"}, headers=admin_headers)
        assert r2.status_code == 200
        assert r2.json()["business_name"] == "TEST_BolsonesNuevo"
        # restore
        requests.put(f"{API}/config", json={"business_name": original}, headers=admin_headers)


# ============== ROLE PERMISSIONS ==============
class TestRoles:
    def test_cajero_cannot_create_product(self, cajero_token):
        h = {"Authorization": f"Bearer {cajero_token}"}
        payload = {"name": "TEST_Forbid", "category": "fruta", "unit": "kg"}
        r = requests.post(f"{API}/products", json=payload, headers=h)
        assert r.status_code == 403

    def test_cajero_can_sell(self, cajero_token, admin_headers):
        h = {"Authorization": f"Bearer {cajero_token}"}
        prods = requests.get(f"{API}/products", headers=admin_headers).json()
        papa = next(p for p in prods if p["name"] == "Papa")
        payload = {
            "items": [{"type": "product", "ref_id": papa["id"], "name": "Papa",
                       "quantity": 0.5, "unit": "kg", "unit_price": 700, "subtotal": 350}],
            "payment_method": "efectivo",
        }
        r = requests.post(f"{API}/sales", json=payload, headers=h)
        assert r.status_code == 200, r.text

    def test_armador_can_build_bag(self, armador_token, admin_headers):
        h = {"Authorization": f"Bearer {armador_token}"}
        bts = requests.get(f"{API}/bag-types", headers=admin_headers).json()
        bt = next(b for b in bts if b["name"] == "Bolsón Mixto Familiar")
        ensure_recipe_stock(bt, admin_headers)
        ingredients = [{"product_id": r["product_id"], "product_name": r["product_name"],
                        "quantity": r["quantity"], "unit": r["unit"], "cost": 0} for r in bt["recipe"]]
        payload = {"bag_type_id": bt["id"], "weight_kg": 7.5, "ingredients_used": ingredients}
        r = requests.post(f"{API}/bags/build", json=payload, headers=h)
        assert r.status_code == 200, r.text


# ============== PRUEBA DE FUEGO END-TO-END (ETAPA 1 completa) ==============
class TestFireDrillEtapa1:
    """Simula un día real de operación de punta a punta: compra con pesaje de
    cajón, armado de bolsón, venta al peso vía ticket (balanza -> caja), venta
    directa en POS, merma, reclasificación (pérdida), y cierre de caja
    reconciliado. Si esto pasa de punta a punta, la Etapa 1 está sólida."""

    def test_full_day_reconciles_stock_and_cash(self, admin_headers):
        # --- 0. Arrancar con una caja propia y limpia para poder reconciliar ---
        cur = requests.get(f"{API}/cash/current", headers=admin_headers).json()
        if cur:
            requests.post(f"{API}/cash/close", json={"real_amount": 0}, headers=admin_headers)
        ropen = requests.post(f"{API}/cash/open", json={"initial_amount": 10000}, headers=admin_headers)
        assert ropen.status_code == 200, ropen.text
        initial_amount = 10000.0

        prods = requests.get(f"{API}/products", headers=admin_headers).json()

        # --- 1. Compra con pesaje de cajón (Tomate) ---
        tomate = next(p for p in prods if p["name"] == "Tomate")
        stock_tomate_before = float(tomate["current_stock"])
        crates = requests.get(f"{API}/crate-types", headers=admin_headers).json()
        chico = next(c for c in crates if c["name"] == "Cajón chico")
        gross, count, total_cost = 22.0, 3, 15000.0
        net_kg = round(gross - chico["tare_kg"] * count, 2)
        rp = requests.post(f"{API}/purchases", json={
            "items": [{
                "product_id": tomate["id"], "unit": "kg",
                "quantity": net_kg, "kg_equivalent": net_kg,
                "unit_cost": round(total_cost / net_kg, 2), "total_cost": total_cost,
                "crate_type_id": chico["id"], "crate_type_name": chico["name"],
                "crate_count": count, "gross_weight": gross,
            }],
            "payment_method": "efectivo", "payment_status": "pagado",
        }, headers=admin_headers)
        assert rp.status_code == 200, rp.text
        stock_tomate_after_purchase = float(
            requests.get(f"{API}/products/{tomate['id']}", headers=admin_headers).json()["current_stock"])
        assert round(stock_tomate_after_purchase, 2) == round(stock_tomate_before + net_kg, 2)

        # --- 2. Armado de bolsón ---
        bts = requests.get(f"{API}/bag-types", headers=admin_headers).json()
        bt = next(b for b in bts if b["name"] == "Bolsón Mixto Familiar")
        ensure_recipe_stock(bt, admin_headers)
        ingredients = [{"product_id": ri["product_id"], "product_name": ri["product_name"],
                        "quantity": ri["quantity"], "unit": ri["unit"], "cost": 0} for ri in bt["recipe"]]
        rb = requests.post(f"{API}/bags/build",
                           json={"bag_type_id": bt["id"], "weight_kg": 7.5, "ingredients_used": ingredients},
                           headers=admin_headers)
        assert rb.status_code == 200, rb.text
        bag = rb.json()

        # --- 3. Venta al peso vía ticket (balanza -> caja) ---
        st = requests.post(f"{API}/stations", json={"name": "TEST_Balanza_Fuego", "kind": "balanza"},
                           headers=admin_headers)
        assert st.status_code == 200, st.text
        station = st.json()
        rt = requests.post(f"{API}/tickets", json={"station_id": station["id"]}, headers=admin_headers)
        assert rt.status_code == 200, rt.text
        ticket_id = rt.json()["id"]
        ri1 = requests.post(f"{API}/tickets/{ticket_id}/items",
                            json={"type": "product", "ref_id": tomate["id"], "quantity": 2}, headers=admin_headers)
        assert ri1.status_code == 200, ri1.text
        ri2 = requests.post(f"{API}/tickets/{ticket_id}/items",
                            json={"type": "bag", "ref_id": bag["code"], "quantity": 1}, headers=admin_headers)
        assert ri2.status_code == 200, ri2.text
        rsend = requests.post(f"{API}/tickets/{ticket_id}/send", headers=admin_headers)
        assert rsend.status_code == 200, rsend.text
        rconf = requests.post(f"{API}/tickets/{ticket_id}/confirm", json={"payment_method": "efectivo"},
                              headers=admin_headers)
        assert rconf.status_code == 200, rconf.text
        ticket_total = rconf.json()["sale"]["total"]

        stock_tomate_after_ticket = float(
            requests.get(f"{API}/products/{tomate['id']}", headers=admin_headers).json()["current_stock"])
        assert round(stock_tomate_after_ticket, 2) == round(stock_tomate_after_purchase - 2, 2)
        bag_after = requests.get(f"{API}/bags/{bag['id']}", headers=admin_headers).json()
        assert bag_after["status"] == "vendido"

        # --- 4. Venta directa en POS ---
        papa = next(p for p in prods if p["name"] == "Papa")
        stock_papa_before = float(
            requests.get(f"{API}/products/{papa['id']}", headers=admin_headers).json()["current_stock"])
        rs = requests.post(f"{API}/sales", json={
            "items": [{"type": "product", "ref_id": papa["id"], "name": "Papa",
                       "quantity": 3, "unit": "kg", "unit_price": 700, "subtotal": 2100}],
            "payment_method": "efectivo",
        }, headers=admin_headers)
        assert rs.status_code == 200, rs.text
        pos_total = rs.json()["total"]
        stock_papa_after = float(
            requests.get(f"{API}/products/{papa['id']}", headers=admin_headers).json()["current_stock"])
        assert round(stock_papa_after, 2) == round(stock_papa_before - 3, 2)

        # --- 5. Merma (pérdida por descarte) ---
        cebolla = next(p for p in prods if p["name"] == "Cebolla")
        stock_cebolla_before = float(
            requests.get(f"{API}/products/{cebolla['id']}", headers=admin_headers).json()["current_stock"])
        rw = requests.post(f"{API}/waste", json={"product_id": cebolla["id"], "quantity": 1.5, "unit": "kg",
                                                  "reason": "podrido", "estimated_cost": 380}, headers=admin_headers)
        assert rw.status_code == 200, rw.text
        stock_cebolla_after = float(
            requests.get(f"{API}/products/{cebolla['id']}", headers=admin_headers).json()["current_stock"])
        assert round(stock_cebolla_after, 2) == round(stock_cebolla_before - 1.5, 2)

        # --- 6. Reclasificación (pérdida por degradar a producto más barato) ---
        premium = next((p for p in prods if p.get("reclassification_target_id")), None)
        if not premium:
            pytest.skip("Ningún producto tiene reclassification_target_id configurado en el seed")
        economica = next(p for p in prods if p["id"] == premium["reclassification_target_id"])
        stock_premium_before = float(
            requests.get(f"{API}/products/{premium['id']}", headers=admin_headers).json()["current_stock"])
        stock_econ_before = float(
            requests.get(f"{API}/products/{economica['id']}", headers=admin_headers).json()["current_stock"])
        rr = requests.post(f"{API}/reclassify", json={
            "source_product_id": premium["id"], "target_product_id": economica["id"],
            "quantity": 2, "reason": "TEST_fuego madurez avanzada",
        }, headers=admin_headers)
        assert rr.status_code == 200, rr.text
        stock_premium_after = float(
            requests.get(f"{API}/products/{premium['id']}", headers=admin_headers).json()["current_stock"])
        stock_econ_after = float(
            requests.get(f"{API}/products/{economica['id']}", headers=admin_headers).json()["current_stock"])
        assert round(stock_premium_after, 2) == round(stock_premium_before - 2, 2)
        assert round(stock_econ_after, 2) == round(stock_econ_before + 2, 2)

        # --- 7. Cierre de caja: todo lo cobrado en efectivo debe reconciliar ---
        expected_total = initial_amount + ticket_total + pos_total
        rclose = requests.post(f"{API}/cash/close", json={"real_amount": expected_total}, headers=admin_headers)
        assert rclose.status_code == 200, rclose.text
        closed = rclose.json()
        assert closed["status"] == "cerrada"
        assert round(closed["expected_amount"], 2) == round(expected_total, 2)
        assert closed["difference"] == 0

        # Dejamos una caja abierta de nuevo para no interferir si se re-corre la suite.
        requests.post(f"{API}/cash/open", json={"initial_amount": 5000}, headers=admin_headers)