import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDate } from "../lib/format";
import StateBadge from "../components/StateBadge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Search, Edit, Boxes } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { v: "all", l: "Todas" },
  { v: "fruta", l: "Fruta" },
  { v: "verdura", l: "Verdura" },
  { v: "frutos_secos", l: "Frutos secos" },
  { v: "aromatica", l: "Aromática" },
  { v: "insumo", l: "Insumo" },
  { v: "packaging", l: "Packaging" },
  { v: "otro", l: "Otro" },
];

const UNITS = ["kg", "unidad", "cajon", "bolsa", "atado", "bulto"];

const blankProduct = {
  name: "", plu: "", category: "verdura", unit: "kg", sale_mode: "per_weight",
  current_stock: 0, minimum_stock: 0, average_cost: 0, sale_price: 0,
  reclassification_target_id: null, featured: false,
  active: true, notes: "",
};

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(null); // product
  const [editing, setEditing] = useState(blankProduct);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);  

  const load = async () => {
    const { data } = await api.get("/products");
    setProducts(data);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, search, category]);

  const openNew = () => { setEditing(blankProduct); setOpen(true); };
  const openEdit = (p) => { setEditing({ ...p }); setOpen(true); };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api.patch(`/products/${editing.id}`, editing);
        toast.success("Producto actualizado");
      } else {
        await api.post("/products", editing);
        toast.success("Producto creado");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const applyAdjust = async () => {
    if (adjusting) return;
    setAdjusting(true);
    try {
      await api.post(`/products/${adjustOpen.id}/adjust`, { delta: Number(delta), reason });
      toast.success("Stock ajustado");
      setAdjustOpen(null);
      setDelta(0); setReason("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setAdjusting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Inventario</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Stock</h1>
          <p className="text-sm text-gray-500 mt-1">{products.length} productos · {products.filter(p=>p.current_stock <= p.minimum_stock).length} bajo mínimo</p>
        </div>
        <Button onClick={openNew} className="bg-[hsl(var(--primary))] hover:bg-[#1F2922]" data-testid="new-product-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo producto
        </Button>
      </div>

      <div className="card-soft p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="stock-search-input"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-48" data-testid="stock-category-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">PLU</th>
                <th className="text-left px-4 py-3 font-medium">Producto</th>
                <th className="text-left px-4 py-3 font-medium">Categoría</th>
                <th className="text-left px-4 py-3 font-medium">Venta</th>
                <th className="text-right px-4 py-3 font-medium">Stock</th>
                <th className="text-right px-4 py-3 font-medium">Mínimo</th>
                <th className="text-right px-4 py-3 font-medium">Costo prom.</th>
                <th className="text-right px-4 py-3 font-medium">Precio venta</th>
                <th className="text-left px-4 py-3 font-medium">Última compra</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const low = Number(p.current_stock) <= Number(p.minimum_stock);
                return (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/50" data-testid={`product-row-${p.id}`}>
                    <td className="px-4 py-3 font-mono-display text-sm text-gray-600">{p.plu || "—"}</td>
                    <td className="px-4 py-3 font-medium">{p.featured && <span title="Destacado">⭐ </span>}{p.name}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{p.category}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {p.sale_mode === "per_weight" ? "por peso" : "por unidad"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-display">
                      <span className={low ? "text-orange-600 font-semibold" : ""}>
                        {p.current_stock} {p.unit}
                      </span>
                      {low && <div className="mt-1"><StateBadge status="stock_bajo" /></div>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 font-mono-display">{p.minimum_stock}</td>
                    <td className="px-4 py-3 text-right font-mono-display">{money(p.average_cost)}</td>
                    <td className="px-4 py-3 text-right font-mono-display">{money(p.sale_price)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(p.last_purchase_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setAdjustOpen(p)} data-testid={`adjust-${p.id}`}>
                          <Boxes className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(p)} data-testid={`edit-${p.id}`}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-500">No hay productos con esos filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nombre</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="product-name-input" />
            </div>
            <div>
              <Label>PLU / Código</Label>
              <Input value={editing.plu || ""} onChange={(e) => setEditing({ ...editing, plu: e.target.value })} placeholder="Ej: 1001" data-testid="product-plu-input" />
            </div>
            <div>
              <Label>Forma de venta</Label>
              <Select value={editing.sale_mode || "per_weight"} onValueChange={(v) => setEditing({ ...editing, sale_mode: v })}>
                <SelectTrigger data-testid="product-salemode-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_weight">Por peso (kg)</SelectItem>
                  <SelectItem value="per_unit">Por unidad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.filter(c=>c.v!=="all").map(c => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidad</Label>
              <Select value={editing.unit} onValueChange={(v) => setEditing({ ...editing, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stock actual</Label>
              <Input type="number" value={editing.current_stock} onChange={(e) => setEditing({ ...editing, current_stock: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Stock mínimo</Label>
              <Input type="number" value={editing.minimum_stock} onChange={(e) => setEditing({ ...editing, minimum_stock: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Costo promedio</Label>
              <Input type="number" value={editing.average_cost} onChange={(e) => setEditing({ ...editing, average_cost: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Precio venta</Label>
              <Input type="number" value={editing.sale_price} onChange={(e) => setEditing({ ...editing, sale_price: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <Label>Producto destino de reclasificación (opcional)</Label>
              <Select value={editing.reclassification_target_id || "none"} onValueChange={(v) => setEditing({ ...editing, reclassification_target_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Sin destino" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin destino —</SelectItem>
                  {products.filter(p => p.id !== editing.id).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.plu ? ` (${p.plu})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-gray-500 mt-1">Al reclasificar, el stock se movería a este producto (más barato).</div>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="featured-check"
                checked={!!editing.featured}
                onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                data-testid="product-featured-checkbox"
              />
              <Label htmlFor="featured-check" className="!mb-0">
                Destacado (aparece en "Los más pedidos" del catálogo online)
              </Label>
            </div>
            <div className="col-span-2">
              <Label>Observaciones</Label>
              <Input value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-[hsl(var(--primary))]" data-testid="save-product-btn">{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustOpen} onOpenChange={(v) => !v && setAdjustOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar stock - {adjustOpen?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-gray-500">Stock actual: <span className="font-mono-display">{adjustOpen?.current_stock} {adjustOpen?.unit}</span></div>
            <div>
              <Label>Cambio (positivo = sumar, negativo = restar)</Label>
              <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} data-testid="adjust-delta-input" />
            </div>
            <div>
              <Label>Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: conteo físico" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(null)}>Cancelar</Button>
            <Button onClick={applyAdjust} disabled={adjusting} className="bg-[hsl(var(--primary))]" data-testid="apply-adjust-btn">{adjusting ? "Aplicando..." : "Aplicar ajuste"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
