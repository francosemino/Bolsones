import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDateTime } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { toast } from "sonner";
import StateBadge from "../components/StateBadge";

export default function Cash() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movDialog, setMovDialog] = useState(false);
  const [initial, setInitial] = useState(0);
  const [real, setReal] = useState(0);
  const [mvType, setMvType] = useState("ingreso");
  const [mvAmount, setMvAmount] = useState(0);
  const [mvDesc, setMvDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [c, h] = await Promise.all([api.get("/cash/current"), api.get("/cash/history")]);
    setCurrent(c.data); setHistory(h.data);
  };
  useEffect(() => { load(); }, []);

  const openCash = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.post("/cash/open", { initial_amount: Number(initial) });
      toast.success("Caja abierta");
      setOpenDialog(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const closeCash = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.post("/cash/close", { real_amount: Number(real) });
      toast.success("Caja cerrada");
      setCloseDialog(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const addMov = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.post("/cash/movement", { type: mvType, amount: Number(mvAmount), description: mvDesc, method: "efectivo" });
      toast.success("Movimiento registrado");
      setMovDialog(false); setMvAmount(0); setMvDesc(""); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const salesTotal = current?.movements?.filter(m => m.type === "venta").reduce((s, m) => s + m.amount, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Operación</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Caja</h1>
        </div>
        {current ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMovDialog(true)} data-testid="cash-mov-btn">+ Movimiento</Button>
            <Button className="bg-[hsl(var(--primary))]" onClick={() => setCloseDialog(true)} data-testid="cash-close-btn">Cerrar caja</Button>
          </div>
        ) : (
          <Button className="bg-[hsl(var(--primary))]" onClick={() => setOpenDialog(true)} data-testid="cash-open-btn">
            <Wallet className="w-4 h-4 mr-1.5" /> Abrir caja
          </Button>
        )}
      </div>

      {current && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card-soft p-5">
            <div className="label-uppercase">Inicial</div>
            <div className="text-2xl font-semibold mt-2 font-mono-display">{money(current.initial_amount)}</div>
            <div className="text-xs text-gray-500 mt-1">Por {current.opened_by_name}</div>
          </div>
          <div className="card-soft p-5">
            <div className="label-uppercase">Ventas en caja</div>
            <div className="text-2xl font-semibold mt-2 font-mono-display">{money(salesTotal)}</div>
            <div className="text-xs text-gray-500 mt-1">{current.movements.filter(m => m.type === "venta").length} operaciones</div>
          </div>
          <div className="card-soft p-5">
            <div className="label-uppercase">Movimientos</div>
            <div className="text-2xl font-semibold mt-2">{current.movements.length}</div>
          </div>
          <div className="card-soft p-5">
            <div className="label-uppercase">Estado</div>
            <div className="mt-3"><StateBadge status="abierta" /></div>
            <div className="text-xs text-gray-500 mt-2">Abierta {fmtDateTime(current.opened_at)}</div>
          </div>
        </div>
      )}

      {current && (
        <div className="card-soft p-5">
          <div className="label-uppercase mb-3">Ventas por método</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(current.sales_by_method || {}).map(([k, v]) => (
              <div key={k} className="border border-gray-200 rounded-md p-3">
                <div className="text-xs text-gray-500 capitalize">{k.replace("_", " ")}</div>
                <div className="font-semibold font-mono-display mt-1">{money(v)}</div>
              </div>
            ))}
            {Object.keys(current.sales_by_method || {}).length === 0 && <div className="text-sm text-gray-500">Sin ventas aún</div>}
          </div>
        </div>
      )}

      <div className="card-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="label-uppercase">{current ? "Movimientos de hoy" : "Historial reciente"}</div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Tipo</th>
              <th className="text-left px-4 py-2 font-medium">Descripción</th>
              <th className="text-left px-4 py-2 font-medium">Método</th>
              <th className="text-right px-4 py-2 font-medium">Monto</th>
              <th className="text-left px-4 py-2 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {(current ? current.movements : history.slice(0, 30)).slice().reverse().map((m, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-2 capitalize">
                  {["venta", "ingreso"].includes(m.type) ? <ArrowUpRight className="inline w-3.5 h-3.5 text-emerald-600 mr-1" /> : <ArrowDownRight className="inline w-3.5 h-3.5 text-red-500 mr-1" />}
                  {m.type}
                </td>
                <td className="px-4 py-2">{m.description || (current ? "—" : `Sesión ${m.id?.slice(0,8)}`)}</td>
                <td className="px-4 py-2 capitalize">{m.method || (m.status ? "—" : "—")}</td>
                <td className="px-4 py-2 text-right font-mono-display">{money(m.amount || (m.initial_amount || 0))}</td>
                <td className="px-4 py-2 text-gray-600">{fmtDateTime(m.created_at || m.opened_at)}</td>
              </tr>
            ))}
            {(current ? !current.movements?.length : !history.length) && <tr><td colSpan={5} className="text-center py-10 text-gray-500">Sin movimientos</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Abrir caja</DialogTitle></DialogHeader>
          <div><Label>Monto inicial (efectivo)</Label>
            <Input type="number" value={initial} onChange={(e) => setInitial(e.target.value)} data-testid="cash-initial-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
                        <Button onClick={openCash} disabled={saving} className="bg-[hsl(var(--primary))]" data-testid="cash-open-confirm">{saving ? "Abriendo..." : "Abrir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cerrar caja</DialogTitle></DialogHeader>
          <div>
            <Label>Monto real contado</Label>
            <Input type="number" value={real} onChange={(e) => setReal(e.target.value)} data-testid="cash-real-input" />
            <div className="text-xs text-gray-500 mt-1">El sistema calculará la diferencia con el esperado.</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Cancelar</Button>
            <Button onClick={closeCash} disabled={saving} className="bg-[hsl(var(--primary))]" data-testid="cash-close-confirm">{saving ? "Cerrando..." : "Cerrar caja"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movDialog} onOpenChange={setMovDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Movimiento de caja</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Tipo</Label>
              <Select value={mvType} onValueChange={setMvType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="egreso">Egreso / Gasto</SelectItem>
                  <SelectItem value="retiro">Retiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Monto</Label><Input type="number" value={mvAmount} onChange={(e) => setMvAmount(e.target.value)} /></div>
            <div><Label>Descripción</Label><Input value={mvDesc} onChange={(e) => setMvDesc(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(false)}>Cancelar</Button>
            <Button onClick={addMov} disabled={saving} className="bg-[hsl(var(--primary))]">{saving ? "Registrando..." : "Registrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
