import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, kg } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Sprout, Scale, Printer, Shuffle, Check } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function BagBuilder() {
  const [bagTypes, setBagTypes] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [ingredients, setIngredients] = useState([]); // [{product_id, product_name, quantity, unit}]
  const [weight, setWeight] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const [notes, setNotes] = useState("");
  const [scaleMode, setScaleMode] = useState("manual"); // manual | simulated
  const [building, setBuilding] = useState(false);
  const [lastBag, setLastBag] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const [bt, prods] = await Promise.all([api.get("/bag-types?active_only=true"), api.get("/products")]);
      setBagTypes(bt.data); setProducts(prods.data);
    })();
  }, []);

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const selectedType = bagTypes.find(b => b.id === selectedTypeId);

  useEffect(() => {
    if (selectedType && selectedType.recipe) {
      setIngredients(selectedType.recipe.map(r => ({ ...r })));
      if (selectedType.target_weight) setWeight(selectedType.target_weight.toString());
    } else {
      setIngredients([]);
    }
  }, [selectedTypeId]); // eslint-disable-line

  const totalCost = useMemo(() => {
    return ingredients.reduce((s, ing) => {
      const p = productMap[ing.product_id];
      return s + (p ? Number(p.average_cost) * Number(ing.quantity || 0) : 0);
    }, 0);
  }, [ingredients, productMap]);

  const estimatedPrice = useMemo(() => {
    if (overridePrice) return Number(overridePrice);
    if (!selectedType) return 0;
    if (selectedType.pricing_mode === "per_kg") return Number(selectedType.price_per_kg) * Number(weight || 0);
    return Number(selectedType.fixed_price);
  }, [selectedType, overridePrice, weight]);

  const updIngredient = (i, field, val) => {
    const next = [...ingredients]; next[i] = { ...next[i], [field]: val };
    if (field === "product_id") {
      const p = productMap[val]; if (p) { next[i].unit = p.unit; next[i].product_name = p.name; }
    }
    setIngredients(next);
  };

  const simulateWeight = () => {
    if (!selectedType) return;
    const target = Number(selectedType.target_weight) || 5;
    const noise = (Math.random() - 0.5) * 0.6;
    setWeight((target + noise).toFixed(3));
    setScaleMode("simulated");
    toast.success("Peso leído de balanza simulada");
  };

  const build = async () => {
    if (!selectedTypeId) return toast.error("Elegí un tipo de bolsón");
    if (!weight || Number(weight) <= 0) return toast.error("Ingresá un peso válido");
    setBuilding(true);
    try {
      const { data } = await api.post("/bags/build", {
        bag_type_id: selectedTypeId,
        weight_kg: Number(weight),
        ingredients_used: ingredients.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: Number(i.quantity),
          unit: i.unit,
          cost: 0,
        })),
        notes,
        override_price: overridePrice ? Number(overridePrice) : null,
      });
      toast.success(`Bolsón ${data.code} armado`);
      setLastBag(data);
      setWeight(""); setOverridePrice(""); setNotes("");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label-uppercase">Producción</div>
        <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Armado de bolsones</h1>
        <p className="text-sm text-gray-500 mt-1">Pesá, descontá stock y generá etiqueta con QR.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: type + recipe */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card-soft p-5">
            <Label>Tipo de bolsón</Label>
            <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
              <SelectTrigger className="mt-1" data-testid="bag-type-select"><SelectValue placeholder="Elegir tipo..." /></SelectTrigger>
              <SelectContent>
                {bagTypes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {selectedType && (
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="label-uppercase text-[10px]">Modo</div>
                  <div className="mt-1 capitalize">{selectedType.pricing_mode === "fixed" ? "Precio fijo" : "Por kg"}</div>
                </div>
                <div>
                  <div className="label-uppercase text-[10px]">Precio base</div>
                  <div className="mt-1 font-mono-display">
                    {selectedType.pricing_mode === "fixed" ? money(selectedType.fixed_price) : `${money(selectedType.price_per_kg)}/kg`}
                  </div>
                </div>
                <div>
                  <div className="label-uppercase text-[10px]">Peso objetivo</div>
                  <div className="mt-1 font-mono-display">{selectedType.target_weight} kg</div>
                </div>
              </div>
            )}
          </div>

          {selectedType && (
            <div className="card-soft p-5">
              <div className="label-uppercase mb-3">Receta · ajustá cantidades reales</div>
              <div className="space-y-2">
                {ingredients.map((ing, i) => {
                  const prod = productMap[ing.product_id];
                  const insufficient = prod && Number(prod.current_stock) < Number(ing.quantity);
                  return (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center text-sm">
                      <div className="col-span-5 font-medium">{prod?.name || ing.product_name}</div>
                      <div className="col-span-3">
                        <Input type="number" step="0.1" value={ing.quantity} onChange={(e) => updIngredient(i, "quantity", e.target.value)} data-testid={`ingredient-qty-${i}`} />
                      </div>
                      <div className="col-span-2 text-gray-500">{ing.unit}</div>
                      <div className="col-span-2 text-right text-xs">
                        <div className={insufficient ? "text-red-600" : "text-gray-500"}>
                          Stock: {prod?.current_stock} {prod?.unit}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {ingredients.length === 0 && <div className="text-sm text-gray-500">Este bolsón no tiene receta avanzada — sólo se registrará el peso final.</div>}
              </div>
              {ingredients.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-sm">
                  <span className="text-gray-500">Costo estimado</span>
                  <span className="font-mono-display font-semibold">{money(totalCost)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: scale + actions */}
        <div className="space-y-4">
          <div className="card-soft p-5">
            <div className="flex items-center justify-between">
              <div className="label-uppercase">Balanza</div>
              <Select value={scaleMode} onValueChange={setScaleMode}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="simulated">Simulada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 bg-gray-50 border-2 border-gray-200 rounded-lg p-6 text-center shadow-inner">
              <div className="text-5xl font-mono-display text-[hsl(var(--primary))] tracking-wider" data-testid="scale-display">
                {weight || "0.000"}
              </div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-widest">kg</div>
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                type="number"
                step="0.001"
                placeholder="Peso manual"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                data-testid="weight-manual-input"
              />
              <Button variant="outline" onClick={simulateWeight} data-testid="simulate-scale-btn">
                <Shuffle className="w-4 h-4 mr-1.5" /> Simular
              </Button>
            </div>
            <div className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
              <Scale className="w-3 h-3" /> {scaleMode === "simulated" ? "Modo balanza simulada" : "Ingresá peso manual"}
            </div>
          </div>

          <div className="card-soft p-5 space-y-3">
            <div>
              <Label>Precio final (opcional)</Label>
              <Input type="number" placeholder={`Sugerido: ${money(estimatedPrice)}`} value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} data-testid="override-price-input" />
              <div className="text-xs text-gray-500 mt-1 flex justify-between">
                <span>Precio calculado</span>
                <span className="font-mono-display font-semibold text-gray-700">{money(estimatedPrice)}</span>
              </div>
            </div>
            <div>
              <Label>Observaciones</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </div>
            <Button
              className="w-full bg-[hsl(var(--primary))] hover:bg-[#1F2922] h-11"
              onClick={build}
              disabled={building || !selectedTypeId}
              data-testid="build-bag-btn"
            >
              <Sprout className="w-4 h-4 mr-1.5" /> {building ? "Armando..." : "Armar bolsón"}
            </Button>
          </div>

          {lastBag && (
            <div className="card-soft p-5 border-emerald-300 bg-emerald-50/40">
              <div className="flex items-center gap-2 text-emerald-700 mb-2">
                <Check className="w-4 h-4" /> <span className="font-medium">Bolsón {lastBag.code} armado</span>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-600">Peso:</span><span className="font-mono-display">{kg(lastBag.weight_kg)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Precio:</span><span className="font-mono-display">{money(lastBag.final_price)}</span></div>
              </div>
              <Button
                className="w-full mt-3 bg-[hsl(var(--accent))] hover:bg-orange-600"
                onClick={() => window.open(`/label/${lastBag.id}`, "_blank")}
                data-testid="print-label-btn"
              >
                <Printer className="w-4 h-4 mr-1.5" /> Imprimir etiqueta
              </Button>
              <Button variant="outline" className="w-full mt-2" onClick={() => nav("/app/bags")}>Ver bolsones</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
