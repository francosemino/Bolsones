import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDate } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import StateBadge from "../components/StateBadge";
import { toast } from "sonner";

export default function Purchases() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [payment, setPayment] = useState("efectivo");
  const [paymentStatus, setPaymentStatus] = useState("pagado");
  const [items, setItems] = useState([]);

  const load = async () => {
    const [a, b, c] = await Promise.all([
      api.get("/purchases"), api.get("/products"), api.get("/suppliers"),
    ]);
    setList(a.data); setProducts(b.data); setSuppliers(c.data);
  };
  useEffect(() => { load(); }, []);

  const addItem = () => setItems([...items, { product_id: "", quantity: 1, unit: "kg", kg_equivalent: 1, unit_cost: 0, total_cost: 0 }]);
  const updItem = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    if (field === "quantity" || field === "kg_equivalent" || field === "unit_cost") {
      const q = Number(next[i].quantity || 0);
      const c = Number(next[i].unit_cost || 0);
      next[i].total_cost = q * c;
      if (next[i].unit === "kg" && !next[i].kg_equivalent) next[i].kg_equivalent = q;
    }
    if (field === "product_id") {
      const p = products.find(p => p.id === val);
      if (p) {
        next[i].unit = p.unit;
        if (p.unit === "kg") next[i].kg_equivalent = next[i].quantity || 1;
      }
    }
    setItems(next);
  };
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const total = items.reduce((s, it) => s + Number(it.total_cost || 0), 0);

  const save = async () => {
    try {
      if (!items.length) return toast.error("Agregá al menos un producto");
      await api.post("/purchases", {
        supplier_id: supplier || null,
        items: items.map(it => ({
          ...it,
          quantity: Number(it.quantity),
          kg_equivalent: Number(it.kg_equivalent || it.quantity),
          unit_cost: Number(it.unit_cost),
          total_cost: Number(it.total_cost),
        })),
        payment_method: payment,
        payment_status: paymentStatus,
      });
      toast.success("Compra registrada y stock actualizado");
      setOpen(false); setItems([]); setSupplier(""); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Inventario</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Compras</h1>
          <p className="text-sm text-gray-500 mt-1">Registro de compras a proveedores · {list.length} compras</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-[hsl(var(--primary))]" data-testid="new-purchase-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Registrar compra
        </Button>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 font-medium">Proveedor</th>
                <th className="text-left px-4 py-3 font-medium">Items</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Método</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3 font-medium">{p.supplier_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{p.items.length} productos</td>
                  <td className="px-4 py-3 text-right font-mono-display">{money(p.total)}</td>
                  <td className="px-4 py-3 capitalize text-gray-600">{p.payment_method}</td>
                  <td className="px-4 py-3"><StateBadge status={p.payment_status === "pagado" ? "pagado" : "pendiente_pago"} /></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-gray-500">Sin compras registradas</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrar compra</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Proveedor</Label>
                <Select value={supplier} onValueChange={setSupplier}>
                  <SelectTrigger data-testid="purchase-supplier-select"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Método de pago</Label>
                <Select value={payment} onValueChange={setPayment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="cuenta_corriente">Cuenta corriente</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado de pago</Label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pagado">Pagado</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="label-uppercase">Productos</div>
                <Button size="sm" variant="outline" onClick={addItem} data-testid="add-purchase-item"><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center p-3 border border-gray-200 rounded-md">
                    <div className="col-span-12 md:col-span-4">
                      <Select value={it.product_id} onValueChange={(v) => updItem(i, "product_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Producto" /></SelectTrigger>
                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input type="number" placeholder="Cant." value={it.quantity} onChange={(e) => updItem(i, "quantity", e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input type="number" placeholder="Kg equiv." value={it.kg_equivalent} onChange={(e) => updItem(i, "kg_equivalent", e.target.value)} title="Cantidad en unidad principal (ej: cajón 18kg → 18)" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input type="number" placeholder="Costo unit." value={it.unit_cost} onChange={(e) => updItem(i, "unit_cost", e.target.value)} />
                    </div>
                    <div className="col-span-3 md:col-span-1 text-right font-mono-display text-sm">
                      {money(it.total_cost)}
                    </div>
                    <div className="col-span-1 text-right">
                      <Button size="sm" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="text-sm text-gray-500 p-3 text-center border border-dashed border-gray-200 rounded-md">Sin productos aún</div>}
              </div>
            </div>

            <div className="flex justify-end text-lg font-semibold border-t border-gray-200 pt-3">
              Total: <span className="ml-2 font-mono-display">{money(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-[hsl(var(--primary))]" data-testid="save-purchase-btn">Registrar compra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
