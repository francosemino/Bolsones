# BolsonesControl - PRD

## Original Problem Statement
Aplicación web completa para administrar un negocio de bolsones de frutas y verduras: POS + gestión de stock + producción de bolsones + pedidos + empleados + reportes. Sistema en español, moneda ARS, fechas dd/mm/aaaa.

## User Personas
- **Administrador**: dueño/a, acceso total a costos, ganancias, configuración, empleados.
- **Encargado**: gestiona ventas, stock, pedidos, producción. No ve config sensible.
- **Cajero**: vende y opera caja. No ve costos/ganancias.
- **Armador**: arma bolsones, lee balanza, imprime etiquetas.
- **Repartidor**: ve sólo entregas asignadas.
- **Solo lectura**: visualiza, no edita.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor async) + JWT (cookies + Bearer)
- **Frontend**: React 19 + React Router 7 + Tailwind + shadcn/ui + Recharts + qrcode + jsbarcode
- **Auth**: JWT con bcrypt, cookies httpOnly + token Bearer en localStorage
- **Diseño**: Minimalista fresco · Olive/Sage primario (#2C392F) + Naranja accent (#E67E22)

## What's been implemented (08/06/2026)

### Backend (server.py + models.py + auth.py + seed.py)
- Auth: login/logout/me/users (CRUD) con roles y JWT
- Productos: CRUD, ajuste manual, movimientos por producto
- Proveedores: CRUD
- Compras: registrar compra con múltiples items, actualiza stock + costo promedio + movimientos
- Tipos de Bolsón: CRUD con receta (RecipeItem)
- Bolsones (armado): POST /bags/build descuenta stock, calcula costo y margen, genera BOL-XXXXXX, valida stock insuficiente; búsqueda por código (`/bags/by-code/{code}`)
- Ventas (POS): valida bolsones (no doble venta), descuenta productos, registra en caja, actualiza customer.total_spent
- Pedidos: CRUD + flujo Kanban; endpoint público (POST /public/orders) y catálogo público (GET /public/catalog)
- Caja: open/close/movements/history con cálculo de diferencia
- Gastos: CRUD
- Empleados: CRUD
- Mermas: registrar (descuenta stock + movimiento)
- Reportes: /dashboard, /reports/sales, /reports/stock
- Configuración: GET/PUT /config con módulos habilitables y config de balanza

### Frontend (20 pantallas)
- Login con hero visual minimalista + demo creds
- Sidebar persistente con permisos por rol
- Dashboard con 8 métricas, alertas, entregas de hoy, stock crítico
- Stock (buscador, filtros, alta/edición, ajuste manual)
- Compras (modal con items, calcula total, actualiza stock)
- Proveedores
- Tipos de Bolsón (grid de cards + editor de receta)
- **Armado de Bolsones** (selección de tipo + receta editable + balanza con display LCD JetBrains Mono + simulador + override de precio + auto-print)
- Bolsones disponibles (filtro por estado, imprimir etiqueta, descartar)
- **Etiqueta imprimible** con QR (qrcode) + código de barras CODE128 (jsbarcode) + datos del negocio
- **POS** con escaneo, búsqueda de productos sueltos, carrito, descuento, métodos de pago, modal de confirmación
- Caja con apertura/cierre/movimientos y vista de ventas por método
- **Pedidos en Kanban** (6 columnas), avanzar estado, WhatsApp a cliente, crear pedido manual
- Clientes con historial y marca "frecuente"
- Mermas con motivos predefinidos
- Empleados
- Gastos con categorías y estado de pago
- Reportes con gráficos (LineChart + Pie + Bar de Recharts)
- Configuración (negocio + balanza + módulos)
- **Formulario público de pedidos** (/pedido) con hero + catálogo + form + confirmación con código y WhatsApp

### Data demo seeded
- 11 productos, 3 proveedores, 4 clientes, 4 tipos de bolsón con recetas, 3 bolsones armados (BOL-000001..3), 1 pedido (PED-000001), 3 gastos, 1 merma
- 3 cuentas: admin/cajero/armador

## Roles y test credentials
Ver `/app/memory/test_credentials.md`

## Prioritized backlog (P1/P2)
### P1 (próximas)
- Delivery: pantalla específica con agrupación por zona y asignación de repartidor
- Cuentas corrientes (clientes y proveedores con saldo + pagos parciales)
- Sueldos: registro de jornadas, pagos y adelantos
- Trazabilidad por lotes (LOTE-PRODUCTO-FECHA-NN) ligados a compra → bolsón → venta

### P2
- Impresoras térmicas Zebra/TSC con ZPL/TSPL
- Web Serial real para balanza
- Mapas para reparto
- Exportar reportes a CSV/PDF
- Modo oscuro completo

## Testing
- Backend: 32/32 pytest passing (`/app/backend/tests/test_bolsones.py`)
- Frontend smoke: login, dashboard, stock, armado, etiqueta con QR+barcode, POS, pedido público, Kanban, reportes
