import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

const blank = { name: "", description: "", pricing_mode: "fixed", fixed_price: 0, price_per_kg: 0, target_weight: 0, recipe: [], active: true };

export default function BagTypes() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(blank);

  const load = async () => {
    const [a, b] = await Promise.all([api.get("/bag-types"), api.get("/products")]);
    setList(a.data); setProducts(b.data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...edit, recipe: edit.recipe.map(r => ({ ...r, quantity: Number(r.quantity) })) };
      if (edit.id) await api.patch(`/bag-types/${edit.id}`, body);
      else await api.post("/bag-types", body);
      toast.success("Tipo de bolsón guardado"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const addRecipe = () => setEdit({ ...edit, recipe: [...edit.recipe, { product_id: "", quantity: 1, unit: "kg" }] });
  const updRecipe = (i, field, val) => {
    const next = [...edit.recipe]; next[i] = { ...next[i], [field]: val };
    if (field === "product_id") {
      const p = products.find(x => x.id === val); if (p) next[i].unit = p.unit;
    }
    setEdit({ ...edit, recipe: next });
  };
  const removeRecipe = (i) => setEdit({ ...edit, recipe: edit.recipe.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Producción</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Tipos de Bolsón</h1>
          <p className="text-sm text-gray-500 mt-1">{list.length} tipos definidos</p>
        </div>
        <Button onClick={() => { setEdit({ ...blank, recipe: [] }); setOpen(true); }} className="bg-[hsl(var(--primary))]" data-testid="new-bag-type-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo tipo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((b) => (
          <div key={b.id} className="card-soft p-5 flex flex-col" data-testid={`bag-type-card-${b.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold" style={{ fontFamily: "Outfit" }}>{b.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{b.description}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setEdit({ ...b }); setOpen(true); }}><Edit className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
              <div>
                <div className="label-uppercase text-[10px]">Precio</div>
                <div className="font-semibold font-mono-display mt-1">
                  {b.pricing_mode === "fixed" ? money(b.fixed_price) : `${money(b.price_per_kg)}/kg`}
                </div>
              </div>
              <div>
                <div className="label-uppercase text-[10px]">Peso obj.</div>
                <div className="font-semibold font-mono-display mt-1">{b.target_weight} kg</div>
              </div>
              <div>
                <div className="label-uppercase text-[10px]">Ítems</div>
                <div className="font-semibold mt-1">{b.recipe?.length || 0}</div>
              </div>
            </div>
            {b.recipe && b.recipe.length > 0 && (
              <div className="mt-3 text-xs text-gray-600 space-y-0.5">
                {b.recipe.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{r.product_name}</span>
                    <span className="font-mono-display">{r.quantity} {r.unit}</span>
                  </div>
                ))}
                {b.recipe.length > 4 && <div className="text-gray-400">+ {b.recipe.length - 4} más</div>}
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="col-span-full text-center py-10 text-gray-500">Sin tipos de bolsón aún</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit.id ? "Editar" : "Nuevo"} tipo de bolsón</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="bag-type-name-input" /></div>
            <div><Label>Descripción</Label><Input value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Modo de precio</Label>
                <Select value={edit.pricing_mode} onValueChange={(v) => setEdit({ ...edit, pricing_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Precio fijo</SelectItem>
                    <SelectItem value="per_kg">Por kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Precio fijo</Label><Input type="number" value={edit.fixed_price} onChange={(e) => setEdit({ ...edit, fixed_price: Number(e.target.value) })} /></div>
              <div><Label>Precio por kg</Label><Input type="number" value={edit.price_per_kg} onChange={(e) => setEdit({ ...edit, price_per_kg: Number(e.target.value) })} /></div>
              <div><Label>Peso objetivo (kg)</Label><Input type="number" value={edit.target_weight} onChange={(e) => setEdit({ ...edit, target_weight: Number(e.target.value) })} /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="label-uppercase">Receta</div>
                <Button size="sm" variant="outline" onClick={addRecipe}><Plus className="w-4 h-4 mr-1" /> Agregar ingrediente</Button>
              </div>
              <div className="space-y-2">
                {edit.recipe.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 border border-gray-200 rounded-md">
                    <div className="col-span-7">
                      <Select value={r.product_id} onValueChange={(v) => updRecipe(i, "product_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Producto" /></SelectTrigger>
                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3"><Input type="number" value={r.quantity} onChange={(e) => updRecipe(i, "quantity", e.target.value)} placeholder="Cant." /></div>
                    <div className="col-span-1 text-sm text-gray-500">{r.unit}</div>
                    <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeRecipe(i)}><Trash2 className="w-4 h-4 text-red-500" /></Button></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-[hsl(var(--primary))]" data-testid="save-bag-type-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
