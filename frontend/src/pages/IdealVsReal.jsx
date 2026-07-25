import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingDown, Repeat, Trash2, Percent } from "lucide-react";

const COLORS = ["#B85C39", "#D6A22A", "#65A48F", "#2C392F"];

export default function IdealVsReal() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    api.get("/reports/ideal-vs-real", { params: { days } }).then(r => setData(r.data));
  }, [days]);

  if (!data) return <div className="text-gray-500">Cargando...</div>;

  const pieData = [
    { name: "Real facturado", value: data.total_real, color: "#2C392F" },
    { name: "Decomiso", value: data.total_decomiso_loss, color: "#B85C39" },
    { name: "Reclasificación", value: data.total_reclass_loss, color: "#D6A22A" },
    { name: "Descuentos", value: data.total_discount_loss, color: "#65A48F" },
  ].filter(x => x.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Análisis</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
            <TrendingDown className="w-7 h-7" /> Ideal vs Real
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cuánto se hubiera facturado sin pérdidas, comparado con lo que efectivamente entró en caja.
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              data-testid={`ivr-range-${d}`}
              className={`px-3 py-1.5 text-sm rounded-md border ${days === d ? "bg-[hsl(var(--primary))] text-white border-transparent" : "bg-white border-gray-200"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="card-soft p-5">
          <div className="label-uppercase">Ideal (potencial)</div>
          <div className="text-3xl font-semibold mt-2 font-mono-display">{money(data.total_ideal)}</div>
          <div className="text-xs text-gray-500 mt-1">Si todo entraba y se vendía a precio pleno</div>
        </div>
        <div className="card-soft p-5">
          <div className="label-uppercase">Real facturado</div>
          <div className="text-3xl font-semibold mt-2 font-mono-display text-[hsl(var(--primary))]">{money(data.total_real)}</div>
          <div className="text-xs text-gray-500 mt-1">Lo que efectivamente cobraste</div>
        </div>
        <div className="card-soft p-5">
          <div className="label-uppercase">Diferencia</div>
          <div className="text-3xl font-semibold mt-2 font-mono-display text-orange-700">{money(data.total_gap)}</div>
          <div className="text-xs text-gray-500 mt-1">{data.gap_pct}% del ideal</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-soft p-4">
          <div className="flex items-center gap-2 mb-1">
            <Trash2 className="w-4 h-4 text-red-600" />
            <div className="label-uppercase">Decomiso</div>
          </div>
          <div className="text-2xl font-semibold font-mono-display">{money(data.total_decomiso_loss)}</div>
          <div className="text-xs text-gray-500 mt-1">Producto que se tiró (valuado a precio pleno)</div>
        </div>
        <div className="card-soft p-4">
          <div className="flex items-center gap-2 mb-1">
            <Repeat className="w-4 h-4 text-amber-600" />
            <div className="label-uppercase">Reclasificación</div>
          </div>
          <div className="text-2xl font-semibold font-mono-display">{money(data.total_reclass_loss)}</div>
          <div className="text-xs text-gray-500 mt-1">Diferencia de precio al degradar</div>
        </div>
        <div className="card-soft p-4">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="w-4 h-4 text-emerald-700" />
            <div className="label-uppercase">Descuentos por mal estado</div>
          </div>
          <div className="text-2xl font-semibold font-mono-display">{money(data.total_discount_loss)}</div>
          <div className="text-xs text-gray-500 mt-1">Margen resignado al vender</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-soft p-5">
          <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Composición del ideal</h3>
          {pieData.length === 0 ? (
            <div className="text-gray-500 py-10 text-center">Sin datos en el período</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Legend />
                <Tooltip formatter={(v) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card-soft p-5">
          <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Top pérdidas por producto</h3>
          {data.by_product.length === 0 ? (
            <div className="text-gray-500 py-10 text-center">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.by_product.slice(0, 8).map(p => ({ name: p.product_name, gap: p.gap }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" width={130} fontSize={11} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="gap" fill="#B85C39" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="label-uppercase">Detalle por producto</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Producto</th>
                <th className="text-right px-4 py-3 font-medium">Ideal</th>
                <th className="text-right px-4 py-3 font-medium">Real</th>
                <th className="text-right px-4 py-3 font-medium">Decomiso</th>
                <th className="text-right px-4 py-3 font-medium">Reclas.</th>
                <th className="text-right px-4 py-3 font-medium">Descuentos</th>
                <th className="text-right px-4 py-3 font-medium">Gap %</th>
              </tr>
            </thead>
            <tbody>
              {data.by_product.map(p => (
                <tr key={p.product_id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{p.product_name}</td>
                  <td className="px-4 py-2 text-right font-mono-display">{money(p.ideal)}</td>
                  <td className="px-4 py-2 text-right font-mono-display text-[hsl(var(--primary))]">{money(p.real)}</td>
                  <td className="px-4 py-2 text-right font-mono-display text-red-600">{money(p.decomiso_loss)}</td>
                  <td className="px-4 py-2 text-right font-mono-display text-amber-700">{money(p.reclass_loss)}</td>
                  <td className="px-4 py-2 text-right font-mono-display text-emerald-700">{money(p.discount_loss)}</td>
                  <td className="px-4 py-2 text-right font-mono-display text-gray-600">{p.gap_pct}%</td>
                </tr>
              ))}
              {data.by_product.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-gray-500">Sin datos en el período</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
