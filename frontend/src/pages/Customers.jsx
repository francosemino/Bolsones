import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDate } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Edit, Star, Phone } from "lucide-react";
import { toast } from "sonner";

const blank = { name: "", phone: "", email: "", address: "", zone: "", notes: "", frequent: false, active: true };

export default function Customers() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = async () => setList((await api.get("/customers", { params: { search: search || undefined } })).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (edit.id) await api.patch(`/customers/${edit.id}`, edit);
      else await api.post("/customers", edit);
      toast.success("Cliente guardado"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Gestión</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">{list.length} clientes</p>
        </div>
        <Button onClick={() => { setEdit(blank); setOpen(true); }} className="bg-[hsl(var(--primary))]" data-testid="new-customer-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo cliente
        </Button>
      </div>

      <div className="card-soft p-4">
        <Input placeholder="Buscar por nombre o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="customers-search" />
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium">Zona</th>
                <th className="text-left px-4 py-3 font-medium">Dirección</th>
                <th className="text-right px-4 py-3 font-medium">Total comprado</th>
                <th className="text-left px-4 py-3 font-medium">Última</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      {c.name}
                      {c.frequent && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.phone && <a className="hover:underline" href={`https://wa.me/${c.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">{c.phone}</a>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.zone}</td>
                  <td className="px-4 py-3 text-gray-600">{c.address}</td>
                  <td className="px-4 py-3 text-right font-mono-display">{money(c.total_spent)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(c.last_purchase_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => { setEdit({ ...c }); setOpen(true); }}><Edit className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-gray-500">Sin clientes</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{edit.id ? "Editar" : "Nuevo"} cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="customer-name-input" /></div>
            <div><Label>Teléfono</Label><Input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            <div><Label>Zona / barrio</Label><Input value={edit.zone || ""} onChange={(e) => setEdit({ ...edit, zone: e.target.value })} /></div>
            <div><Label>Notas</Label><Input value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.frequent} onChange={(e) => setEdit({ ...edit, frequent: e.target.checked })} />
              Cliente frecuente
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-[hsl(var(--primary))]" data-testid="save-customer-btn">{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
