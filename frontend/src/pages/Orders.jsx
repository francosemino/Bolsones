import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Phone, Trash2, ArrowRight, Store, Truck, Wallet, Eye, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

const STATUSES = [
  { key: "pendiente", label: "Pendiente", color: "bg-amber-100 text-amber-700" },
  { key: "confirmado", label: "Confirmado", color: "bg-blue-100 text-blue-700" },
  { key: "preparacion", label: "En preparación", color: "bg-purple-100 text-purple-700" },
  { key: "listo", label: "Listo", color: "bg-emerald-100 text-emerald-700" },
  { key: "reparto", label: "En reparto", color: "bg-cyan-100 text-cyan-700" },
  { key: "entregado", label: "Entregado", color: "bg-slate-100 text-slate-600" },
];

const fmtDateLabel = (iso) => {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return iso;
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [bagTypes, setBagTypes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [validDates, setValidDates] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [viewOrder, setViewOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState("activos"); // activos | <status> | todos

  const load = async () => {
    const [o, bt, c, d] = await Promise.all([
      api.get("/orders"), api.get("/bag-types?active_only=true"), api.get("/customers"),
      api.get("/orders/next-delivery-dates"),
    ]);
    setOrders(o.data); setBagTypes(bt.data); setCustomers(c.data); setValidDates(d.data.dates || []);
  };
  useEffect(() => { load(); }, []);

  const advance = async (order, nextStatus) => {
    try {
      await api.patch(`/orders/${order.id}`, { status: nextStatus });
      toast.success(`Pedido ${order.code} → ${STATUSES.find(s => s.key === nextStatus)?.label}`);
      if (viewOrder?.id === order.id) setViewOrder({ ...viewOrder, status: nextStatus });
      load();
    } catch (e) { toast.error("No se pudo actualizar"); }
  };

  const cancel = async (order) => {
    if (!window.confirm(`¿Cancelar pedido ${order.code}?`)) return;
    try {
      await api.patch(`/orders/${order.id}`, { status: "cancelado" });
      if (viewOrder?.id === order.id) setViewOrder(null);
      load();
    }
    catch (e) { toast.error("Error"); }
  };

  const markPayment = async (order, status) => {
    try {
      await api.patch(`/orders/${order.id}`, { payment_status: status });
      toast.success(status === "pagado" ? `${order.code} marcado como pagado` : `${order.code}: pago ${status}`);
      if (viewOrder?.id === order.id) setViewOrder({ ...viewOrder, payment_status: status });
      load();
    } catch (e) { toast.error("No se pudo actualizar el pago"); }
  };

  const create = async (form) => {
    try {
      const total = form.items.reduce((s, i) => s + i.subtotal, 0);
      await api.post("/orders", { ...form, total });
      toast.success("Pedido creado");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const countFor = (key) => orders.filter(o => o.status === key).length;
  const activeCount = orders.filter(o => o.status !== "entregado" && o.status !== "cancelado").length;

  const shown = useMemo(() => {
    let list = orders;
    if (statusFilter === "activos") list = orders.filter(o => o.status !== "entregado" && o.status !== "cancelado");
    else if (statusFilter !== "todos") list = orders.filter(o => o.status === statusFilter);
    return [...list].sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""));
  }, [orders, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Operación</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Pedidos</h1>
          <p className="text-sm text-gray-500 mt-1">{activeCount} activos</p>
        </div>
        <Button
          onClick={() => { setEdit({ customer_name: "", customer_phone: "", delivery_type: "retiro", address: "", scheduled_date: validDates[0] || "", payment_method: "efectivo", items: [], notes: "" }); setOpen(true); }}
          className="bg-[hsl(var(--primary))]"
          data-testid="new-order-btn"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo pedido
        </Button>
      </div>

      {/* Filtro de estado — pills horizontales, cómodo con el pulgar en el celular */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setStatusFilter("activos")}
          className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border ${statusFilter === "activos" ? "bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]" : "border-gray-200 text-gray-600"}`}
        >
          Activos ({activeCount})
        </button>
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border ${statusFilter === s.key ? "bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]" : "border-gray-200 text-gray-600"}`}
            data-testid={`status-filter-${s.key}`}
          >
            {s.label} ({countFor(s.key)})
          </button>
        ))}
        <button
          onClick={() => setStatusFilter("todos")}
          className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border ${statusFilter === "todos" ? "bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]" : "border-gray-200 text-gray-600"}`}
        >
          Todos ({orders.length})
        </button>
      </div>

      {/* Lista apilada — una tarjeta por pedido, pensada para uso a una mano en el teléfono */}
      <div className="space-y-3 max-w-xl">
        {shown.map(o => {
          const st = STATUSES.find(s => s.key === o.status);
          const statusIdx = STATUSES.findIndex(s => s.key === o.status);
          const nextStatus = statusIdx >= 0 && statusIdx < STATUSES.length - 1 ? STATUSES[statusIdx + 1] : null;
          return (
            <div key={o.id} className="card-soft p-4" data-testid={`order-card-${o.code}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono-display font-semibold text-[hsl(var(--primary))]">{o.code}</div>
                  <div className="font-semibold text-base mt-0.5">{o.customer_name}</div>
                  {o.customer_phone && <div className="text-sm text-gray-500">{o.customer_phone}</div>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {st && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>}
                  {o.source === "publico" && <span className="text-[10px] text-gray-400 uppercase">Pedido online</span>}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  {o.delivery_type === "envio" ? <Truck className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
                  {o.delivery_type === "envio" ? "Envío" : "Retiro en local"}
                </span>
                {o.scheduled_date && <span>{fmtDateLabel(o.scheduled_date)}</span>}
                {o.payment_method && (
                  <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> {o.payment_method === "transferencia" ? "Transferencia" : "Efectivo"}</span>
                )}
              </div>
              {o.delivery_type === "envio" && o.address && <div className="text-sm text-gray-500 mt-1">{o.address}</div>}

              <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-0.5">
                {o.items.slice(0, 3).map((i, idx) => (
                  <div key={idx} className="flex justify-between text-sm text-gray-600">
                    <span>{i.quantity}{i.unit === "kg" ? "kg" : "×"} {i.name}</span>
                    <span className="font-mono-display">{money(i.subtotal)}</span>
                  </div>
                ))}
                {o.items.length > 3 && (
                  <button onClick={() => setViewOrder(o)} className="text-xs text-[hsl(var(--primary))] font-medium pt-0.5" data-testid={`see-more-${o.code}`}>
                    + {o.items.length - 3} más — ver pedido completo
                  </button>
                )}
              </div>

              <button
                onClick={() => setViewOrder(o)}
                className="w-full flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-left"
                data-testid={`view-order-${o.code}`}
              >
                <span className="text-sm text-gray-500 flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Ver pedido completo</span>
                <span className="font-semibold font-mono-display text-lg">{money(o.total)}</span>
              </button>

              {o.notes && <div className="text-xs text-gray-500 mt-1.5 italic">"{o.notes}"</div>}

              <button
                onClick={() => markPayment(o, o.payment_status === "pagado" ? "pendiente" : "pagado")}
                className={`w-full flex items-center justify-center gap-1.5 mt-2.5 py-2 rounded-md text-sm font-medium ${
                  o.payment_status === "pagado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
                data-testid={`payment-toggle-${o.code}`}
              >
                {o.payment_status === "pagado" ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                {o.payment_status === "pagado" ? "Pagado" : o.payment_status === "parcial" ? "Pago parcial — tocar para confirmar" : "Falta cobrar — tocar al entregar"}
              </button>

              <div className="mt-2 flex gap-2">
                {nextStatus && o.status !== "cancelado" && (
                  <Button className="flex-1 h-11 bg-[hsl(var(--primary))]" onClick={() => advance(o, nextStatus.key)} data-testid={`advance-${o.code}`}>
                    {nextStatus.label} <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                )}
                {o.customer_phone && (
                  <a href={`https://wa.me/${o.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${o.customer_name}, te escribimos por tu pedido ${o.code}`)}`} target="_blank" rel="noreferrer">
                    <Button variant="outline" className="h-11 w-11 p-0"><Phone className="w-4 h-4" /></Button>
                  </a>
                )}
                {o.status !== "entregado" && o.status !== "cancelado" && (
                  <Button variant="ghost" className="h-11 w-11 p-0" onClick={() => cancel(o)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div className="text-sm text-gray-400 text-center py-14">Sin pedidos en esta categoría</div>}
      </div>

      {viewOrder && (
        <OrderDetailDialog order={viewOrder} onClose={() => setViewOrder(null)} onAdvance={advance} onCancel={cancel} onMarkPayment={markPayment} />
      )}

      {open && edit && (
        <OrderDialog open={open} setOpen={setOpen} bagTypes={bagTypes} customers={customers}
          validDates={validDates} onSave={create} initial={edit} />
      )}
    </div>
  );
}

function OrderDetailDialog({ order, onClose, onAdvance, onCancel, onMarkPayment }) {
  const st = STATUSES.find(s => s.key === order.status);
  const statusIdx = STATUSES.findIndex(s => s.key === order.status);
  const nextStatus = statusIdx >= 0 && statusIdx < STATUSES.length - 1 ? STATUSES[statusIdx + 1] : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span className="font-mono-display">{order.code}</span>
            <div className="flex items-center gap-1.5">
              {st && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.payment_status === "pagado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {order.payment_status === "pagado" ? "✓ Pagado" : order.payment_status === "parcial" ? "Parcial" : "Falta pagar"}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="font-semibold text-lg">{order.customer_name}</div>
            {order.customer_phone && <div className="text-sm text-gray-500">{order.customer_phone}</div>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              {order.delivery_type === "envio" ? <Truck className="w-4 h-4" /> : <Store className="w-4 h-4" />}
              {order.delivery_type === "envio" ? "Envío" : "Retiro en local"}
            </div>
            {order.payment_method && (
              <div className="flex items-center gap-1.5 text-gray-600">
                <Wallet className="w-4 h-4" /> {order.payment_method === "transferencia" ? "Transferencia" : "Efectivo"}
              </div>
            )}
            {order.scheduled_date && <div className="col-span-2 text-gray-600">📅 {fmtDateLabel(order.scheduled_date)}</div>}
            {order.delivery_type === "envio" && order.address && <div className="col-span-2 text-gray-600">📍 {order.address}</div>}
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="label-uppercase mb-2">Ítems del pedido ({order.items.length})</div>
            <div className="space-y-1.5">
              {order.items.map((i, idx) => (
                <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                  <span className="font-medium">{i.quantity}{i.unit === "kg" ? "kg" : "×"} {i.name}</span>
                  <span className="font-mono-display">{money(i.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 font-semibold">
              <span>Total</span>
              <span className="font-mono-display text-lg">{money(order.total)}</span>
            </div>
          </div>

          {order.notes && (
            <div className="bg-amber-50 text-amber-800 text-sm rounded-md p-3">
              <span className="font-medium">Observaciones: </span>"{order.notes}"
            </div>
          )}

          <div className="border-t border-gray-100 pt-3">
            <div className="label-uppercase mb-2">Estado de pago</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "pendiente", label: "Pendiente" },
                { key: "parcial", label: "Parcial" },
                { key: "pagado", label: "Pagado" },
              ].map(p => (
                <button
                  key={p.key}
                  onClick={() => onMarkPayment(order, p.key)}
                  className={`py-2.5 rounded-md text-sm font-medium border ${
                    order.payment_status === p.key
                      ? p.key === "pagado" ? "bg-emerald-600 text-white border-emerald-600" : "bg-amber-500 text-white border-amber-500"
                      : "border-gray-200 text-gray-600"
                  }`}
                  data-testid={`detail-payment-${p.key}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {nextStatus && order.status !== "cancelado" && (
            <Button className="w-full h-11 bg-[hsl(var(--primary))]" onClick={() => onAdvance(order, nextStatus.key)} data-testid={`detail-advance-${order.code}`}>
              Marcar como "{nextStatus.label}" <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
          <div className="flex gap-2 w-full">
            {order.customer_phone && (
              <a className="flex-1" href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${order.customer_name}, te escribimos por tu pedido ${order.code}`)}`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full h-11"><Phone className="w-4 h-4 mr-1.5" /> WhatsApp</Button>
              </a>
            )}
            {order.status !== "entregado" && order.status !== "cancelado" && (
              <Button variant="outline" className="h-11 text-red-600" onClick={() => onCancel(order)}><Trash2 className="w-4 h-4 mr-1.5" /> Cancelar</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDialog({ open, setOpen, bagTypes, customers, validDates, onSave, initial }) {
  const [form, setForm] = useState(initial);
  const addItem = () => setForm({ ...form, items: [...form.items, { type: "bag_type", ref_id: "", name: "", quantity: 1, unit_price: 0, subtotal: 0 }] });
  const updItem = (i, field, val) => {
    const next = [...form.items]; next[i] = { ...next[i], [field]: val };
    if (field === "ref_id") {
      const bt = bagTypes.find(b => b.id === val);
      if (bt) { next[i].name = bt.name; next[i].unit_price = bt.fixed_price; }
    }
    next[i].subtotal = Number(next[i].quantity) * Number(next[i].unit_price);
    setForm({ ...form, items: next });
  };
  const remove = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  const total = form.items.reduce((s, i) => s + Number(i.subtotal || 0), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo pedido</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Cliente existente</Label>
              <Select value={form.customer_id || ""} onValueChange={(v) => {
                const c = customers.find(x => x.id === v);
                setForm({ ...form, customer_id: v, customer_name: c?.name || "", customer_phone: c?.phone || "", address: c?.address || "", zone: c?.zone || "" });
              }}>
                <SelectTrigger><SelectValue placeholder="Buscar..." /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nombre</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} data-testid="order-customer-name" /></div>
            <div><Label>Teléfono</Label><Input value={form.customer_phone || ""} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
            <div>
              <Label>Tipo de entrega</Label>
              <Select value={form.delivery_type} onValueChange={(v) => setForm({ ...form, delivery_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="retiro">Retiro</SelectItem><SelectItem value="envio">Envío</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pago</Label>
              <Select value={form.payment_method || "efectivo"} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="efectivo">Efectivo</SelectItem><SelectItem value="transferencia">Transferencia</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de entrega</Label>
              <Select value={form.scheduled_date || ""} onValueChange={(v) => setForm({ ...form, scheduled_date: v })}>
                <SelectTrigger><SelectValue placeholder="Elegir fecha" /></SelectTrigger>
                <SelectContent>
                  {validDates.map(d => <SelectItem key={d} value={d}>{fmtDateLabel(d)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.delivery_type === "envio" && <div className="sm:col-span-2"><Label>Dirección</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="label-uppercase">Bolsones / productos</div>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 border border-gray-200 rounded">
                  <div className="col-span-6">
                    <Select value={it.ref_id} onValueChange={(v) => updItem(i, "ref_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Tipo de bolsón" /></SelectTrigger>
                      <SelectContent>{bagTypes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Input type="number" value={it.quantity} onChange={(e) => updItem(i, "quantity", e.target.value)} /></div>
                  <div className="col-span-3 text-right font-mono-display">{money(it.subtotal)}</div>
                  <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => remove(i)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end text-lg font-semibold border-t border-gray-200 pt-3">
            Total: <span className="ml-2 font-mono-display">{money(total)}</span>
          </div>
          <div><Label>Observaciones</Label><Input value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button className="bg-[hsl(var(--primary))]" onClick={() => onSave(form)} data-testid="save-order-btn">Crear pedido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}