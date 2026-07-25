import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { money } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Leaf, ShoppingBag, ShoppingCart, MapPin, Phone, Plus, Minus, Check,
  Search, Apple, Carrot, Nut, Package, ChevronLeft, Calendar, Store, Truck, Wallet,
} from "lucide-react";
import { toast, Toaster } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FILTERS = [
  { key: "todos", label: "Todo", icon: Leaf },
  { key: "bolsones", label: "Bolsones", icon: Package },
  { key: "fruta", label: "Frutas", icon: Apple },
  { key: "verdura", label: "Verduras", icon: Carrot },
  { key: "frutos_secos", label: "Frutos secos", icon: Nut },
];

const fmtDateLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
};

export default function PublicOrder() {
  const [catalog, setCatalog] = useState(null);
  const [validDates, setValidDates] = useState([]);
  const [filter, setFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState({}); // key -> {type, ref_id, name, unit_price, quantity, unit, sale_mode}
  const [view, setView] = useState("catalog"); // catalog | checkout
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", delivery_type: "retiro",
    address: "", scheduled_date: "", payment_method: "efectivo", notes: "",
  });
  const [confirmed, setConfirmed] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/catalog`).then(r => setCatalog(r.data));
    axios.get(`${API}/orders/next-delivery-dates`).then(r => {
      setValidDates(r.data.dates || []);
      if (r.data.dates?.length) setForm(f => ({ ...f, scheduled_date: r.data.dates[0] }));
    });
  }, []);

  // ------- Carrito -------
  const addBag = (bt) => {
    const key = `bag_type-${bt.id}`;
    setCart({ ...cart, [key]: {
      type: "bag_type", ref_id: bt.id, name: bt.name, unit_price: bt.fixed_price,
      quantity: (cart[key]?.quantity || 0) + 1,
    }});
  };
  const removeBag = (bt) => {
    const key = `bag_type-${bt.id}`;
    const n = { ...cart };
    if ((n[key]?.quantity || 0) > 1) n[key] = { ...n[key], quantity: n[key].quantity - 1 };
    else delete n[key];
    setCart(n);
  };
  const setProductQty = (p, qty) => {
    const key = `product-${p.id}`;
    const n = { ...cart };
    if (qty <= 0) { delete n[key]; setCart(n); return; }
    n[key] = {
      type: "product", ref_id: p.id, name: p.name, unit_price: p.sale_price,
      quantity: qty, unit: p.sale_mode === "per_weight" ? "kg" : "unidad",
      sale_mode: p.sale_mode,
    };
    setCart(n);
  };
  const step = (p) => (p.sale_mode === "per_weight" ? 0.5 : 1);
  const bumpProduct = (p, delta) => {
    const key = `product-${p.id}`;
    const cur = cart[key]?.quantity || 0;
    setProductQty(p, Math.max(0, Math.round((cur + delta) * 100) / 100));
  };

  const items = useMemo(() => Object.values(cart), [cart]);
  const total = useMemo(() => items.reduce((s, i) => s + i.unit_price * i.quantity, 0), [items]);
  const looseKg = useMemo(() => items.filter(i => i.type === "product" && i.unit === "kg")
    .reduce((s, i) => s + i.quantity, 0), [items]);
  const looseUnits = useMemo(() => items.filter(i => i.type === "product" && i.unit !== "kg")
    .reduce((s, i) => s + i.quantity, 0), [items]);
  const hasLooseItems = looseKg > 0 || looseUnits > 0;
  const minimumMet = !hasLooseItems || looseKg >= 9 || looseUnits >= 9;
  const itemCount = items.reduce((s, i) => s + (i.type === "bag_type" ? i.quantity : 1), 0);

  // ------- Filtro / búsqueda -------
  const searching = search.trim().length > 0;
  const s = search.trim().toLowerCase();

  const shownBags = useMemo(() => {
    if (!catalog) return [];
    if (!searching && filter !== "todos" && filter !== "bolsones") return [];
    return catalog.bag_types.filter(bt => !searching || bt.name.toLowerCase().includes(s));
  }, [catalog, filter, s, searching]);

  const shownProducts = useMemo(() => {
    if (!catalog) return [];
    if (!searching && filter === "bolsones") return [];
    return catalog.products.filter(p => {
      const matchCat = searching || filter === "todos" || p.category === filter;
      const matchSearch = !searching || p.name.toLowerCase().includes(s);
      return matchCat && matchSearch;
    });
  }, [catalog, filter, s, searching]);

  // ------- Submit -------
  const goCheckout = () => {
    if (!items.length) return toast.error("Agregá al menos un ítem a tu pedido");
    if (!minimumMet) return toast.error(`Los productos sueltos tienen un mínimo de 9kg o 9 productos (llevás ${looseUnits} / ${looseKg.toFixed(1)}kg)`);
    setView("checkout");
    window.scrollTo(0, 0);
  };

  const submit = async () => {
    if (!form.customer_name) return toast.error("Necesitamos tu nombre");
    if (!form.customer_phone) return toast.error("Necesitamos tu teléfono");
    if (form.delivery_type === "envio" && !form.address) return toast.error("Necesitamos la dirección");
    if (!form.scheduled_date) return toast.error("Elegí un día de entrega");
    setSending(true);
    try {
      const payloadItems = items.map(i => ({
        type: i.type, ref_id: i.ref_id, name: i.name, quantity: i.quantity,
        unit: i.unit, unit_price: i.unit_price, subtotal: Math.round(i.unit_price * i.quantity * 100) / 100,
      }));
      const { data } = await axios.post(`${API}/public/orders`, {
        customer_name: form.customer_name, customer_phone: form.customer_phone,
        delivery_type: form.delivery_type, address: form.address,
        scheduled_date: form.scheduled_date, payment_method: form.payment_method,
        notes: form.notes, items: payloadItems, total,
      });
      setConfirmed({ ...data, total });
    } catch (e) {
      toast.error(e.response?.data?.detail || "No pudimos enviar el pedido");
    } finally {
      setSending(false);
    }
  };

  if (!catalog) return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando...</div>;

  // ------- Confirmación -------
  if (confirmed) {
    const waMsg = encodeURIComponent(`Hola! Acabo de hacer un pedido en ${catalog.business.name}.\n\nCódigo: ${confirmed.code}\nNombre: ${form.customer_name}\nTotal: ${money(total)}\nPago: ${form.payment_method === "transferencia" ? "Transferencia" : "Efectivo"}\n\n¿Me confirman?`);
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-5">
        <div className="card-soft p-6 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "Outfit" }}>¡Pedido recibido!</h2>
          <p className="text-gray-500 mt-1">Tu código de pedido es</p>
          <div className="text-3xl font-mono-display font-semibold my-3 text-[hsl(var(--primary))]">{confirmed.code}</div>
          <p className="text-sm text-gray-600">Total: <span className="font-mono-display font-semibold">{money(total)}</span></p>
          <p className="text-sm text-gray-600 mt-1">Entrega: {fmtDateLabel(form.scheduled_date)}</p>
          <p className="text-sm text-gray-500 mt-4">
            Tu pedido está en preparación. Te vamos a avisar cuando esté listo
            {form.delivery_type === "retiro" ? " para retirar" : " para la entrega"}.
            {form.payment_method === "transferencia" && " Te pasamos los datos para transferir por acá:"}
          </p>
          {catalog.business.whatsapp && (
            <a href={`https://wa.me/${catalog.business.whatsapp.replace(/\D/g, '')}?text=${waMsg}`} target="_blank" rel="noreferrer">
              <Button className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700" data-testid="whatsapp-confirm-btn">
                <Phone className="w-4 h-4 mr-1.5" /> Escribir por WhatsApp
              </Button>
            </a>
          )}
          <button
            onClick={() => { setConfirmed(null); setCart({}); setView("catalog"); setForm({ ...form, notes: "" }); }}
            className="mt-4 text-sm text-gray-500 hover:underline"
          >
            Hacer otro pedido
          </button>
        </div>
      </div>
    );
  }

  // ------- Checkout -------
  if (view === "checkout") {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] pb-28">
        <Toaster position="top-center" richColors />
        <div className="sticky top-0 z-10 bg-[hsl(var(--background))]/95 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center gap-2">
          <button onClick={() => setView("catalog")} className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-100" data-testid="back-to-catalog-btn">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="font-semibold" style={{ fontFamily: "Outfit" }}>Confirmar pedido</div>
        </div>

        <div className="max-w-lg mx-auto p-4 space-y-4">
          <div className="card-soft p-4">
            <div className="label-uppercase mb-2">Tu pedido ({itemCount})</div>
            <div className="space-y-1">
              {items.map(i => (
                <div key={`${i.type}-${i.ref_id}`} className="flex justify-between text-sm">
                  <span>{i.quantity}{i.unit === "kg" ? "kg" : "×"} {i.name}</span>
                  <span className="font-mono-display">{money(i.unit_price * i.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-semibold">
              <span>Total</span><span className="font-mono-display">{money(total)}</span>
            </div>
          </div>

          <div className="card-soft p-4 space-y-3">
            <div><Label>Nombre</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} data-testid="public-name-input" /></div>
            <div><Label>Teléfono</Label><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} data-testid="public-phone-input" placeholder="Con código de área" /></div>
          </div>

          <div className="card-soft p-4 space-y-3">
            <div>
              <Label className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Entrega</Label>
              <Select value={form.delivery_type} onValueChange={(v) => setForm({ ...form, delivery_type: v })}>
                <SelectTrigger data-testid="delivery-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retiro"><Store className="w-3.5 h-3.5 inline mr-1.5" />Retiro en el local</SelectItem>
                  <SelectItem value="envio"><Truck className="w-3.5 h-3.5 inline mr-1.5" />Envío a domicilio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.delivery_type === "envio" && (
              <div><Label>Dirección</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="public-address-input" /></div>
            )}
            <div>
              <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Día de entrega</Label>
              <Select value={form.scheduled_date} onValueChange={(v) => setForm({ ...form, scheduled_date: v })}>
                <SelectTrigger data-testid="delivery-date-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {validDates.map(d => <SelectItem key={d} value={d}>{fmtDateLabel(d)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-xs text-gray-400 mt-1">Se reparte martes y jueves.</div>
            </div>
          </div>

          <div className="card-soft p-4 space-y-3">
            <Label className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Forma de pago</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setForm({ ...form, payment_method: "efectivo" })}
                className={`p-3 rounded-md border text-sm font-medium ${form.payment_method === "efectivo" ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5" : "border-gray-200"}`}
                data-testid="payment-efectivo-btn"
              >
                Efectivo
              </button>
              <button
                onClick={() => setForm({ ...form, payment_method: "transferencia" })}
                className={`p-3 rounded-md border text-sm font-medium ${form.payment_method === "transferencia" ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5" : "border-gray-200"}`}
                data-testid="payment-transferencia-btn"
              >
                Transferencia
              </button>
            </div>
            <div className="text-xs text-gray-400">
              {form.payment_method === "transferencia"
                ? "Te pasamos los datos para transferir por WhatsApp al confirmar."
                : "Pagás cuando retirás o te entregamos el pedido."}
            </div>
          </div>

          <div className="card-soft p-4">
            <Label>Observaciones (opcional)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ej: tocar timbre, dejar en portería..." />
          </div>
        </div>

        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-4">
          <div className="max-w-lg mx-auto">
            <Button
              className="w-full bg-[hsl(var(--primary))] hover:bg-[#1F2922] h-12"
              disabled={sending}
              onClick={submit}
              data-testid="public-submit-btn"
            >
              <ShoppingBag className="w-4 h-4 mr-1.5" /> {sending ? "Enviando..." : `Confirmar pedido · ${money(total)}`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ------- Catálogo -------
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] pb-24">
      <Toaster position="top-center" richColors />

      <div className="bg-[#2C392F] text-white px-4 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center"><Leaf className="w-4 h-4" /></div>
          <div className="font-semibold" style={{ fontFamily: "Outfit" }}>{catalog.business.name}</div>
        </div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "Outfit" }}>Hacé tu pedido</h1>
        <p className="text-white/70 text-sm mt-0.5">Bolsones armados o elegí fruta y verdura suelta.</p>
      </div>

      {/* Buscador + filtros */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--background))]/95 backdrop-blur border-b border-gray-100 px-4 py-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="public-search-input"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setSearch(""); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap border ${
                !searching && filter === f.key ? "bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]" : "border-gray-200 text-gray-600"
              }`}
              data-testid={`filter-${f.key}`}
            >
              <f.icon className="w-3.5 h-3.5" /> {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-6">
        {/* Bolsones */}
        {shownBags.length > 0 && (
          <div>
            <div className="label-uppercase mb-2 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Bolsones armados</div>
            <div className="space-y-2">
              {shownBags.map(bt => {
                const qty = cart[`bag_type-${bt.id}`]?.quantity || 0;
                return (
                  <div key={bt.id} className="card-soft p-3 flex items-center justify-between gap-3" data-testid={`public-bag-${bt.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm" style={{ fontFamily: "Outfit" }}>{bt.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{bt.description}</div>
                      <div className="font-semibold mt-1.5 font-mono-display text-sm">
                        {money(bt.fixed_price)} <span className="text-xs text-gray-500 font-normal">≈ {bt.target_weight}kg</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {qty > 0 ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => removeBag(bt)}><Minus className="w-3.5 h-3.5" /></Button>
                          <span className="font-mono-display font-semibold w-5 text-center">{qty}</span>
                          <Button size="sm" variant="outline" onClick={() => addBag(bt)} data-testid={`add-bag-${bt.id}`}><Plus className="w-3.5 h-3.5" /></Button>
                        </>
                      ) : (
                        <Button size="sm" className="bg-[hsl(var(--primary))]" onClick={() => addBag(bt)} data-testid={`add-bag-${bt.id}`}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Productos sueltos */}
        {shownProducts.length > 0 && (
          <div>
            <div className="label-uppercase mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Apple className="w-3.5 h-3.5" /> Fruta y verdura suelta</span>
            </div>
            {hasLooseItems && (
              <div className={`text-xs rounded-md px-3 py-2 mb-2 ${minimumMet ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {minimumMet
                  ? "✓ Llegaste al mínimo de compra"
                  : `Mínimo 9 productos o 9kg para pedido suelto — llevás ${looseUnits} productos / ${looseKg.toFixed(1)}kg`}
              </div>
            )}
            <div className="space-y-2">
              {shownProducts.map(p => {
                const key = `product-${p.id}`;
                const qty = cart[key]?.quantity || 0;
                return (
                  <div key={p.id} className="card-soft p-3 flex items-center justify-between gap-3" data-testid={`public-product-${p.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-xs text-gray-500 font-mono-display">{money(p.sale_price)}/{p.sale_mode === "per_weight" ? "kg" : "u"}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {qty > 0 ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => bumpProduct(p, -step(p))}><Minus className="w-3.5 h-3.5" /></Button>
                          <span className="font-mono-display font-semibold w-10 text-center text-sm">{qty}{p.sale_mode === "per_weight" ? "kg" : ""}</span>
                          <Button size="sm" variant="outline" onClick={() => bumpProduct(p, step(p))} data-testid={`add-product-${p.id}`}><Plus className="w-3.5 h-3.5" /></Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => bumpProduct(p, step(p))} data-testid={`add-product-${p.id}`}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {shownBags.length === 0 && shownProducts.length === 0 && (
          <div className="text-center text-gray-500 py-14 text-sm">No encontramos nada con esa búsqueda.</div>
        )}

        <div className="text-xs text-gray-400 text-center pt-2 space-y-1">
          {catalog.business.address && <div className="flex items-center justify-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {catalog.business.address}</div>}
          {catalog.business.phone && <div className="flex items-center justify-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {catalog.business.phone}</div>}
        </div>
      </div>

      {/* Carrito flotante */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-3">
          <div className="max-w-lg mx-auto">
            <Button
              className="w-full bg-[hsl(var(--primary))] hover:bg-[#1F2922] h-12 justify-between px-4"
              onClick={goCheckout}
              data-testid="go-checkout-btn"
            >
              <span className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> {itemCount} ítem{itemCount > 1 ? "s" : ""}</span>
              <span className="font-mono-display">{money(total)}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}