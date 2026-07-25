import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDateTime } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const REASONS = [
  { v: "vencido", l: "Vencido" },
  { v: "golpeado", l: "Golpeado" },
  { v: "podrido", l: "Podrido" },
  { v: "error_carga", l: "Error de carga" },
  { v: "donacion", l: "Donación" },
  { v: "consumo_interno", l: "Consumo interno" },
  { v: "otro", l: "Otro" },
];

export default function Waste() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", quantity: 0, unit: "kg", reason: "podrido", estimated_cost: 0, notes: "" });

  const load = async () => {
    const [w, p] = await Promise.all([api.get("/waste"), api.get("/products")]);
    setList(w.data); setProducts(p.data);
  };
  useEffect(() => { load(); }, []);

  const onProduct = (id) => {
    const p = products.find(x => x.id === id);
    setForm({ ...form, product_id: id, unit: p?.unit || "kg", estimated_cost: p ? p.average_cost * form.quantity : 0 });
  };
  const onQty = (q) => {
    const p = products.find(x => x.id === form.product_id);
    setForm({ ...form, quantity: Number(q), estimated_cost: p ? p.average_cost * Number(q) : 0 });
  };

  const save = async () => {
    try {
      await api.post("/waste", form);
      toast.success("Merma registrada");
      setOpen(false); setForm({ product_id: "", quantity: 0, unit: "kg", reason: "podrido", estimated_cost: 0, notes: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const totalCost = list.reduce((s, w) => s + Number(w.estimated_cost || 0), 0);
  const byReason = list.reduce((acc, w) => { acc[w.reason] = (acc[w.reason] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Inventario</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Mermas</h1>
          <p className="text-sm text-gray-500 mt-1">Costo total: {money(totalCost)}</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-[hsl(var(--primary))]" data-testid="new-waste-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Registrar merma
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(byReason).map(([k, v]) => (
          <div key={k} className="card-soft p-4">
            <div className="label-uppercase capitalize">{k.replace("_", " ")}</div>
            <div className="text-2xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Producto</th>
              <th className="text-right px-4 py-3 font-medium">Cantidad</th>
              <th className="text-left px-4 py-3 font-medium">Motivo</th>
              <th className="text-right px-4 py-3 font-medium">Costo est.</th>
              <th className="text-left px-4 py-3 font-medium">Usuario</th>
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {list.map(w => (
              <tr key={w.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{w.product_name}</td>
                <td className="px-4 py-3 text-right font-mono-display">{w.quantity} {w.unit}</td>
                <td className="px-4 py-3 capitalize">{w.reason.replace("_", " ")}</td>
                <td className="px-4 py-3 text-right font-mono-display">{money(w.estimated_cost)}</td>
                <td className="px-4 py-3 text-gray-600">{w.user_name}</td>
                <td className="px-4 py-3 text-gray-600">{fmtDateTime(w.created_at)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-gray-500">Sin mermas registradas</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar merma</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Producto</Label>
              <Select value={form.product_id} onValueChange={onProduct}>
                <SelectTrigger data-testid="waste-product-select"><SelectValue placeholder="Elegir" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (stock: {p.current_stock} {p.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cantidad</Label><Input type="number" step="0.01" value={form.quantity} onChange={(e) => onQty(e.target.value)} data-testid="waste-qty-input" /></div>
              <div><Label>Costo estimado</Label><Input type="number" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: Number(e.target.value) })} /></div>
            </div>
            <div>
              <Label>Motivo</Label>
              <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REASONS.map(r => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Observaciones</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-[hsl(var(--primary))]" data-testid="save-waste-btn">Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
