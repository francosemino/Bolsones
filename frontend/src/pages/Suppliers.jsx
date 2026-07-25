import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Edit, Phone } from "lucide-react";
import { toast } from "sonner";
import StateBadge from "../components/StateBadge";

const TYPES = ["mayorista", "quinta", "distribuidor", "mercado", "otro"];

export default function Suppliers() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState({ name: "", phone: "", address: "", type: "mayorista", notes: "", active: true });

  const load = async () => setList((await api.get("/suppliers")).data);
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (edit.id) await api.patch(`/suppliers/${edit.id}`, edit);
      else await api.post("/suppliers", edit);
      toast.success("Proveedor guardado");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Compras</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Proveedores</h1>
          <p className="text-sm text-gray-500 mt-1">{list.length} proveedores</p>
        </div>
        <Button onClick={() => { setEdit({ name: "", phone: "", address: "", type: "mayorista", notes: "", active: true }); setOpen(true); }} className="bg-[hsl(var(--primary))]" data-testid="new-supplier-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo proveedor
        </Button>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium">Dirección</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 capitalize text-gray-600">{s.type}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.phone && <a className="hover:underline inline-flex items-center gap-1" href={`https://wa.me/${s.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"><Phone className="w-3 h-3" />{s.phone}</a>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.address}</td>
                  <td className="px-4 py-3"><StateBadge status={s.active ? "disponible" : "cancelado"} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => { setEdit({ ...s }); setOpen(true); }}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-gray-500">Sin proveedores</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{edit.id ? "Editar" : "Nuevo"} proveedor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="supplier-name-input" /></div>
            <div><Label>Tipo</Label>
              <Select value={edit.type} onValueChange={(v) => setEdit({ ...edit, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Teléfono / WhatsApp</Label><Input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            <div><Label>Observaciones</Label><Input value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-[hsl(var(--primary))]" data-testid="save-supplier-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
