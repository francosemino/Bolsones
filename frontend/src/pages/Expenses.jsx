import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDate } from "../lib/format";
import StateBadge from "../components/StateBadge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["mercaderia", "sueldos", "alquiler", "servicios", "combustible", "packaging", "mantenimiento", "impuestos", "otros"];

const blank = { description: "", category: "otros", amount: 0, payment_method: "efectivo", payment_status: "pagado", type: "variable", notes: "" };

export default function Expenses() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = async () => setList((await api.get("/expenses")).data);
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.post("/expenses", form);
      toast.success("Gasto registrado"); setOpen(false); setForm(blank); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const pending = list.filter(e => e.payment_status === "pendiente").reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Gestión</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Gastos</h1>
        </div>
        <Button onClick={() => { setForm(blank); setOpen(true); }} className="bg-[hsl(var(--primary))]" data-testid="new-expense-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo gasto
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-soft p-5"><div className="label-uppercase">Total registrado</div><div className="text-2xl font-semibold mt-2 font-mono-display">{money(total)}</div></div>
        <div className="card-soft p-5"><div className="label-uppercase">Pendiente</div><div className="text-2xl font-semibold mt-2 font-mono-display text-amber-700">{money(pending)}</div></div>
        <div className="card-soft p-5"><div className="label-uppercase">Cantidad</div><div className="text-2xl font-semibold mt-2">{list.length}</div></div>
      </div>

      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Descripción</th>
              <th className="text-left px-4 py-3 font-medium">Categoría</th>
              <th className="text-right px-4 py-3 font-medium">Monto</th>
              <th className="text-left px-4 py-3 font-medium">Método</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{e.description}</td>
                <td className="px-4 py-3 capitalize">{e.category}</td>
                <td className="px-4 py-3 text-right font-mono-display">{money(e.amount)}</td>
                <td className="px-4 py-3 capitalize">{e.payment_method}</td>
                <td className="px-4 py-3"><StateBadge status={e.payment_status === "pagado" ? "pagado" : "pendiente_pago"} /></td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(e.date)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-gray-500">Sin gastos</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo gasto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Descripción</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="expense-desc-input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Categoría</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Monto</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              <div><Label>Método</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="debito">Débito</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Estado</Label>
                <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pagado">Pagado</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fijo">Fijo</SelectItem>
                    <SelectItem value="variable">Variable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-[hsl(var(--primary))]" data-testid="save-expense-btn">{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
