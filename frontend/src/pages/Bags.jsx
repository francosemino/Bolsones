import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { money, fmtDateTime, kg } from "../lib/format";
import StateBadge from "../components/StateBadge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const STATUSES = [
  { v: "all", l: "Todos" },
  { v: "disponible", l: "Disponibles" },
  { v: "reservado", l: "Reservados" },
  { v: "vendido", l: "Vendidos" },
  { v: "descartado", l: "Descartados" },
];

export default function Bags() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState("disponible");
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await api.get("/bags", { params: { status, search: search || undefined } });
    setList(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const discard = async (b) => {
    if (!window.confirm(`¿Descartar bolsón ${b.code}? Esto lo marcará como pérdida.`)) return;
    try {
      await api.post(`/bags/${b.id}/discard`, { reason: "Descarte manual" });
      toast.success("Bolsón descartado");
      load();
    } catch (e) { toast.error("No se pudo descartar"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label-uppercase">Producción</div>
        <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Bolsones</h1>
        <p className="text-sm text-gray-500 mt-1">{list.length} bolsones</p>
      </div>

      <div className="card-soft p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="Buscar por código o tipo..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} data-testid="bags-search-input" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48" data-testid="bags-status-select"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Código</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 font-medium">Peso</th>
                <th className="text-right px-4 py-3 font-medium">Precio</th>
                <th className="text-right px-4 py-3 font-medium">Costo</th>
                <th className="text-right px-4 py-3 font-medium">Margen</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Armado</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map(b => (
                <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50/50" data-testid={`bag-row-${b.code}`}>
                  <td className="px-4 py-3 font-mono-display font-semibold">{b.code}</td>
                  <td className="px-4 py-3">{b.bag_type_name}</td>
                  <td className="px-4 py-3 text-right font-mono-display">{kg(b.weight_kg)}</td>
                  <td className="px-4 py-3 text-right font-mono-display">{money(b.final_price)}</td>
                  <td className="px-4 py-3 text-right font-mono-display text-gray-600">{money(b.estimated_cost)}</td>
                  <td className="px-4 py-3 text-right font-mono-display text-emerald-700">{money(b.estimated_margin)}</td>
                  <td className="px-4 py-3"><StateBadge status={b.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{fmtDateTime(b.created_at)}<div className="text-xs text-gray-400">{b.created_by_name}</div></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Link to={`/label/${b.id}`} target="_blank">
                        <Button size="sm" variant="outline" data-testid={`print-${b.code}`}><Printer className="w-3.5 h-3.5" /></Button>
                      </Link>
                      {b.status === "disponible" && (
                        <Button size="sm" variant="outline" onClick={() => discard(b)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-gray-500">Sin bolsones</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
