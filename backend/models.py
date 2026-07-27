"""Pydantic models for BolsonesControl."""
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal, Any
from datetime import datetime, timezone
import uuid


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ============================ USER ============================
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    username: str  # para iniciar sesión — no hace falta que sea un email real
    email: Optional[str] = None  # email de contacto real (notificaciones, recuperación)
    name: str
    role: Literal["admin", "encargado", "cajero", "armador", "repartidor", "lectura"] = "cajero"
    permissions: List[str] = []  # "ventas","stock","bolsones","perdidas","pedidos","reportes","empleados","config"
    phone: Optional[str] = None
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    email: Optional[str] = None
    role: str = "cajero"
    permissions: List[str] = []
    phone: Optional[str] = None


class UserLogin(BaseModel):
    identifier: str  # acepta username O email, cualquiera de los dos sirve para entrar
    password: str


# ============================ PRODUCT ============================
class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    plu: Optional[str] = None  # short numeric code for quick search
    category: Literal["fruta", "verdura", "frutos_secos", "aromatica", "insumo", "packaging", "otro"] = "fruta"
    unit: Literal["kg", "unidad", "cajon", "bolsa", "atado", "bulto"] = "kg"
    sale_mode: Literal["per_weight", "per_unit"] = "per_weight"  # how it's sold
    current_stock: float = 0
    minimum_stock: float = 0
    average_cost: float = 0
    sale_price: float = 0
    supplier_id: Optional[str] = None
    last_purchase_at: Optional[str] = None
    reclassification_target_id: Optional[str] = None  # product to degrade this into
    active: bool = True
    image: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ STOCK MOVEMENT ============================
class StockMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    product_id: str
    product_name: Optional[str] = None
    type: Literal["entrada", "salida", "armado", "ajuste", "merma", "devolucion", "consumo", "reclasificacion_out", "reclasificacion_in"]
    quantity: float
    unit: str = "kg"
    cost: Optional[float] = None
    reason: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    reference_id: Optional[str] = None  # purchase, bag, sale
    created_at: str = Field(default_factory=now_iso)
    notes: Optional[str] = None


# ============================ SUPPLIER ============================
class Supplier(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    type: Literal["mayorista", "quinta", "distribuidor", "mercado", "otro"] = "mayorista"
    notes: Optional[str] = None
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


# ============================ PURCHASE ============================
class PurchaseItem(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    quantity: float
    unit: str
    kg_equivalent: float  # final stock change in product's main unit
    unit_cost: float
    total_cost: float
    lot_code: Optional[str] = None
    # Trazabilidad del cálculo por cajón (opcional — solo si se usó el modo
    # "pesada con tara" en vez de cargar los kilos netos directamente).
    crate_type_id: Optional[str] = None
    crate_type_name: Optional[str] = None
    crate_count: Optional[float] = None
    gross_weight: Optional[float] = None  # lo que marcó la balanza, sin descontar tara


class CrateType(BaseModel):
    """Tipo de cajón del mercado central, con su peso de tara conocido."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str  # ej: "Cajón chico", "Bins"
    tare_kg: float  # peso del cajón vacío
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class Purchase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    items: List[PurchaseItem] = []
    total: float = 0
    payment_method: Literal["efectivo", "transferencia", "cuenta_corriente", "otro"] = "efectivo"
    payment_status: Literal["pagado", "pendiente", "parcial"] = "pagado"
    paid_amount: float = 0
    voucher: Optional[str] = None
    notes: Optional[str] = None
    user_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ BAG TYPE ============================
class RecipeItem(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    quantity: float
    unit: str = "kg"


class BagType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    description: Optional[str] = None
    pricing_mode: Literal["fixed", "per_kg"] = "fixed"
    fixed_price: float = 0
    price_per_kg: float = 0
    target_weight: float = 0
    recipe: List[RecipeItem] = []
    active: bool = True
    image: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ BAG (ARMED) ============================
class IngredientUsed(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit: str = "kg"
    cost: float = 0


class Bag(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: str  # BOL-000001
    bag_type_id: str
    bag_type_name: Optional[str] = None
    weight_kg: float
    final_price: float
    estimated_cost: float = 0
    estimated_margin: float = 0
    status: Literal["disponible", "reservado", "vendido", "vencido", "descartado"] = "disponible"
    ingredients_used: List[IngredientUsed] = []
    lot_code: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    sold_at: Optional[str] = None
    sale_id: Optional[str] = None


# ============================ CUSTOMER ============================
class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    zone: Optional[str] = None
    notes: Optional[str] = None
    frequent: bool = False
    active: bool = True
    total_spent: float = 0
    last_purchase_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ SALE ============================
class SaleItem(BaseModel):
    type: Literal["bag", "product"]
    ref_id: str  # bag id or product id
    name: str
    code: Optional[str] = None  # for bags
    quantity: float = 1
    unit: str = "unidad"
    unit_price: float
    subtotal: float


class Sale(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    items: List[SaleItem] = []
    subtotal: float = 0
    discount: float = 0
    total: float = 0
    payment_method: Literal["efectivo", "transferencia", "debito", "credito", "mercadopago", "cuenta_corriente", "mixto"] = "efectivo"
    mixed_payments: Optional[List[dict]] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    cash_session_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    notes: Optional[str] = None


# ============================ ORDER ============================
class OrderItem(BaseModel):
    type: Literal["bag_type", "product", "bag"] = "bag_type"
    ref_id: str
    name: str
    quantity: float = 1
    unit: Optional[str] = None  # "kg" para productos por peso, None/"unidad" para el resto
    unit_price: float
    subtotal: float


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None  # PED-000001
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: Optional[str] = None
    delivery_type: Literal["retiro", "envio"] = "retiro"
    address: Optional[str] = None
    zone: Optional[str] = None
    scheduled_date: Optional[str] = None  # fecha de entrega elegida (debe ser martes o jueves)
    time_slot: Optional[str] = None
    items: List[OrderItem] = []
    total: float = 0
    deposit: float = 0
    payment_method: Literal["efectivo", "transferencia"] = "efectivo"
    status: Literal["pendiente", "confirmado", "preparacion", "listo", "reparto", "entregado", "cancelado"] = "pendiente"
    payment_status: Literal["pendiente", "parcial", "pagado"] = "pendiente"
    source: Literal["interno", "whatsapp", "publico"] = "interno"
    notes: Optional[str] = None
    delivery_person_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ CASH SESSION ============================
class CashMovement(BaseModel):
    id: str = Field(default_factory=new_id)
    type: Literal["ingreso", "egreso", "retiro", "venta", "gasto"]
    amount: float
    method: Optional[str] = None
    description: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class CashSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    opened_by: str
    opened_by_name: Optional[str] = None
    opened_at: str = Field(default_factory=now_iso)
    initial_amount: float = 0
    closed_at: Optional[str] = None
    expected_amount: Optional[float] = None
    real_amount: Optional[float] = None
    difference: Optional[float] = None
    status: Literal["abierta", "cerrada"] = "abierta"
    movements: List[CashMovement] = []
    sales_by_method: dict = {}
    notes: Optional[str] = None


# ============================ EXPENSE ============================
class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    description: str
    category: Literal["mercaderia", "sueldos", "alquiler", "servicios", "combustible", "packaging", "mantenimiento", "impuestos", "otros"] = "otros"
    amount: float
    payment_method: str = "efectivo"
    payment_status: Literal["pagado", "pendiente"] = "pagado"
    type: Literal["fijo", "variable"] = "variable"
    date: str = Field(default_factory=now_iso)
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ EMPLOYEE ============================
class Employee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    phone: Optional[str] = None
    role: str = "cajero"
    payment_type: Literal["dia", "hora", "semanal", "quincenal", "mensual", "comision", "changa"] = "mensual"
    payment_amount: float = 0
    user_id: Optional[str] = None  # cuenta del sistema vinculada, para el login de fichaje por QR
    active: bool = True
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class Attendance(BaseModel):
    """Fichaje de entrada/salida, registrado al escanear el QR del local."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    employee_id: str
    employee_name: Optional[str] = None
    type: Literal["entrada", "salida"]
    created_at: str = Field(default_factory=now_iso)


class PayrollPayment(BaseModel):
    """Registro de un pago de sueldo ya confirmado, para no calcular/pagar dos veces
    el mismo período. Queda enlazado al Expense que se genera automáticamente."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    employee_id: str
    employee_name: Optional[str] = None
    period_start: str
    period_end: str
    hours_worked: float = 0
    amount: float = 0
    expense_id: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ WASTE ============================
class Waste(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    product_id: str
    product_name: Optional[str] = None
    quantity: float
    unit: str = "kg"
    reason: Literal["vencido", "golpeado", "podrido", "error_carga", "donacion", "consumo_interno", "otro"] = "vencido"
    estimated_cost: float = 0
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ BUSINESS CONFIG ============================
class BusinessConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "main"
    business_name: str = "BolsonesControl"
    logo: Optional[str] = None
    address: Optional[str] = "Av. Siempre Viva 742, CABA"
    phone: Optional[str] = "+54 11 0000-0000"
    whatsapp: Optional[str] = "+5491100000000"
    email: Optional[str] = "contacto@bolsones.com"
    cuit: Optional[str] = None
    instagram: Optional[str] = "@bolsonescontrol"
    bank_alias: Optional[str] = None  # para incluir en la confirmación de WhatsApp si el pago es por transferencia
    bank_cbu: Optional[str] = None
    currency: str = "ARS"
    label_text: Optional[str] = "Frutas y verduras seleccionadas - Conservar refrigerado"
    enabled_modules: dict = Field(default_factory=lambda: {
        "advanced_stock": True,
        "recipes": True,
        "scale": True,
        "labels": True,
        "online_orders": True,
        "cash": True,
        "employees": True,
        "accounts": True,
        "delivery": True,
        "traceability": True,
    })
    scale_config: dict = Field(default_factory=lambda: {
        "mode": "manual",  # manual | simulated | web_serial | bridge
        "port": "",
        "baud_rate": 9600,
        "enabled": True,
    })



# ============================ SALES STATION ============================
class SalesStation(BaseModel):
    """Puesto de balanza. Cada puesto emite tickets."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str  # ej: "Balanza 1"
    kind: Literal["balanza", "caja"] = "balanza"
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


# ============================ TICKET (venta en curso) ============================
class TicketItem(BaseModel):
    id: str = Field(default_factory=new_id)
    type: Literal["product", "bag"] = "product"
    ref_id: str  # product_id or bag_id
    name: str
    plu: Optional[str] = None
    sale_mode: Literal["per_weight", "per_unit"] = "per_weight"
    quantity: float  # kg (per_weight) or units (per_unit)
    unit: str = "kg"
    unit_price: float  # price captured when added
    discount_type: Optional[Literal["percent", "amount"]] = None
    discount_value: float = 0  # % or $
    discount_amount: float = 0  # computed $ amount off
    discount_reason: Optional[str] = None
    subtotal_full: float = 0  # quantity * unit_price
    subtotal: float = 0  # after discount
    added_at: str = Field(default_factory=now_iso)
    added_by: Optional[str] = None
    added_by_name: Optional[str] = None


class Ticket(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: str  # TKT-000001
    station_id: str
    station_name: Optional[str] = None
    status: Literal["abierto", "pendiente_caja", "cobrado", "cancelado"] = "abierto"
    items: List[TicketItem] = []
    subtotal_full: float = 0
    subtotal: float = 0  # after item-level discounts
    total_discounts: float = 0  # sum of item discount_amount = margin loss
    total: float = 0
    payment_method: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    cash_session_id: Optional[str] = None
    sale_id: Optional[str] = None
    created_by: str
    created_by_name: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    sent_to_cashier_at: Optional[str] = None
    confirmed_at: Optional[str] = None
    confirmed_by: Optional[str] = None
    confirmed_by_name: Optional[str] = None
    notes: Optional[str] = None


# ============================ PRICE HISTORY ============================
class PriceHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    product_id: str
    product_name: Optional[str] = None
    old_price: float
    new_price: float
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


# ============================ RECLASSIFICATION ============================
class Reclassification(BaseModel):
    """Degradación de producto: mueve stock de un producto a otro más barato."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    source_product_id: str
    source_product_name: Optional[str] = None
    source_unit_price: float = 0
    target_product_id: str
    target_product_name: Optional[str] = None
    target_unit_price: float = 0
    quantity: float
    unit: str = "kg"
    loss_amount: float = 0  # (source_price - target_price) * quantity
    reason: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
