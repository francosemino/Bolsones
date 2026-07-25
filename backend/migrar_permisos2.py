"""
Segunda pasada, más robusta: busca cada función por NOMBRE (no por número de
línea) y le reemplaza el require(...) por el require_perm(...) que corresponda.
Es seguro correrlo aunque algunas funciones ya hayan sido convertidas antes
(las salta sin tocarlas).

Uso:
    python migrar_permisos2.py
"""
import re

with open('server.py', encoding='utf-8') as f:
    content = f.read()

# función -> permiso nuevo
mapping = {
    "list_users": "config", "create_user": "config", "update_user": "config",
    "create_product": "stock", "bulk_update_prices": "stock", "update_product": "stock",
    "delete_product": "stock", "adjust_product_stock": "stock", "create_supplier": "stock",
    "update_supplier": "stock", "delete_supplier": "stock", "create_crate_type": "stock",
    "update_crate_type": "stock", "create_purchase": "stock",
    "create_bag_type": "bolsones", "update_bag_type": "bolsones", "delete_bag_type": "bolsones",
    "build_bag": "bolsones", "update_bag": "bolsones", "discard_bag": "bolsones",
    "delete_customer": "ventas", "create_sale": "ventas",
    "delete_order": "pedidos",
    "cash_open": "ventas", "cash_movement": "ventas", "cash_close": "ventas",
    "list_expenses": "reportes", "create_expense": "reportes", "update_expense": "reportes",
    "delete_expense": "reportes",
    "create_employee": "empleados", "update_employee": "empleados", "delete_employee": "empleados",
    "create_employee_login": "empleados", "unlink_employee_login": "empleados",
    "list_attendance": "empleados", "payroll_calc": "empleados", "payroll_pay": "empleados",
    "payroll_history": "empleados",
    "create_waste": "perdidas", "reclassify": "perdidas",
    "update_config": "config", "create_station": "config", "update_station": "config",
    "create_ticket": "ventas", "add_ticket_item": "ventas", "update_ticket_item": "ventas",
    "remove_ticket_item": "ventas", "send_ticket_to_cashier": "ventas", "confirm_ticket": "ventas",
    "cancel_ticket": "ventas",
    "report_losses": "reportes", "report_ideal_vs_real": "reportes", "product_analytics": "reportes",
    "report_period_compare": "reportes", "report_heatmap": "reportes",
}

changed, avisos, ya_hechos = 0, [], 0

for func_name, perm in mapping.items():
    # Busca "async def <func_name>(" seguido, en algún punto antes de la
    # próxima función/decorador, de un require(...) o require_perm(...)
    def_pattern = re.compile(rf"(async def {re.escape(func_name)}\()")
    m = def_pattern.search(content)
    if not m:
        avisos.append(f"No encontré 'async def {func_name}(' en el archivo")
        continue

    start = m.start()
    # Límite: hasta el próximo '@api.' o 'async def ' (lo que venga primero)
    next_marker = re.search(r"\n@api\.|\nasync def ", content[start + 10:])
    end = start + 10 + next_marker.start() if next_marker else len(content)
    segment = content[start:end]

    if f'require_perm("{perm}")' in segment:
        ya_hechos += 1
        continue

    new_segment, n = re.subn(r'require\([^)]*\)', f'require_perm("{perm}")', segment, count=1)
    if n == 0:
        if 'require_perm(' in segment:
            avisos.append(f"{func_name}: ya tiene require_perm(...) pero con OTRO permiso -- revisar a mano")
        else:
            avisos.append(f"{func_name}: no encontré require(...) ni require_perm(...) cerca de su definición")
        continue

    content = content[:start] + new_segment + content[end:]
    changed += 1

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Convertidas ahora: {changed}")
print(f"Ya estaban hechas (sin tocar): {ya_hechos}")
print(f"Total funciones revisadas: {len(mapping)}")
if avisos:
    print("\nAVISOS (revisar a mano):")
    for a in avisos:
        print(" -", a)
else:
    print("Sin avisos.")