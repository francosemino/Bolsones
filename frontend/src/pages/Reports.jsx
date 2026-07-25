import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { money, fmtDate } from "../lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { TrendingUp, TrendingDown, Package } from "lucide-react";

const COLORS = ["#2C392F", "#E67E22", "#65A48F", "#D6A22A", "#A65440"];

export default function Reports() {
  const [sales, setSales] = useState(null);
  const [stock, setStock] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [compare, setCompare] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    api.get("/reports/sales", { params: { days } }).then(r => setSales(r.data));
    api.get("/reports/period-compare", { params: { days } }).then(r => setCompare(r.data)).catch(() => {});
    api.get("/reports/heatmap", { params: { days } }).then(r => setHeatmap(r.data)).catch(() => {});
    api.get("/reports/product-analytics", { params: { days } }).then(r => setAnalytics(r.data)).catch(() => {});
  }, [days]);

  useEffect(() => {
    api.get("/reports/stock").then(r => setStock(r.data));
  }, []);

  if (!sales || !stock) return <div className="text-gray-500">Cargando reportes...</div>;

  const pieData = Object.entries(sales.by_method).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div className="space-y-6">
      <div>
        <div className="label-uppercase">Análisis</div>
        <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Reportes</h1>
        <p className="text-sm text-gray-500 mt-1">Datos en vivo de tu negocio</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[7, 14, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            data-testid={`range-${d}`}
            className={`px-3 py-1.5 text-sm rounded-md border ${days === d ? "bg-[hsl(var(--primary))] text-white border-transparent" : "bg-white border-gray-200"}`}
          >
            {d} días
          </button>
        ))}
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales" data-testid="tab-sales">Ventas</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">Por producto</TabsTrigger>
          <TabsTrigger value="heatmap" data-testid="tab-heatmap">Cuándo se vende</TabsTrigger>
          <TabsTrigger value="stock" data-testid="tab-stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          {compare && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <PeriodCompareCard label="Total" cur={compare.current.total} prev={compare.previous.total} varPct={compare.variation.total_pct} money />
              <PeriodCompareCard label="Cantidad de ventas" cur={compare.current.count} prev={compare.previous.count} varPct={compare.variation.count_pct} />
              <PeriodCompareCard label="Ticket promedio" cur={compare.current.avg} prev={compare.previous.avg} varPct={compare.variation.avg_pct} money />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-soft p-5">
              <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Ventas por día</h3>
              {sales.series.length === 0 ? (
                <div className="text-gray-500 py-10 text-center">Sin ventas en el período</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={sales.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tickFormatter={(v) => fmtDate(v)} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v) => money(v)} labelFormatter={(v) => fmtDate(v)} />
                    <Line type="monotone" dataKey="total" stroke="#2C392F" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-soft p-5">
              <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Por método de pago</h3>
              {pieData.length === 0 ? (
                <div className="text-gray-500 py-10 text-center">Sin datos</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Legend />
                    <Tooltip formatter={(v) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-soft p-5">
              <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Top bolsones</h3>
              {sales.top_bags.length === 0 ? (
                <div className="text-gray-500 py-6">Sin ventas de bolsones</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={sales.top_bags} layout="vertical">
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="name" width={140} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="qty" fill="#2C392F" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-soft p-5">
              <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Top productos sueltos</h3>
              {sales.top_products.length === 0 ? (
                <div className="text-gray-500 py-6">Sin ventas sueltas</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={sales.top_products} layout="vertical">
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="name" width={120} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="qty" fill="#E67E22" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {!analytics ? (
            <div className="text-gray-500">Cargando...</div>
          ) : (
            <div className="card-soft overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <div className="label-uppercase">Rentabilidad y rotación por producto ({days}d)</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/70 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-right px-3 py-2 font-medium">Vendido (cant.)</th>
                      <th className="text-right px-3 py-2 font-medium">Vendido ($)</th>
                      <th className="text-right px-3 py-2 font-medium">Ganancia bruta</th>
                      <th className="text-right px-3 py-2 font-medium">Pérdidas</th>
                      <th className="text-right px-3 py-2 font-medium">Neto</th>
                      <th className="text-right px-3 py-2 font-medium">Rot. /día</th>
                      <th className="text-right px-3 py-2 font-medium">Últ. venta</th>
                      <th className="text-right px-3 py-2 font-medium">Merma %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...analytics.rows].sort((a, b) => b.sold_amount - a.sold_amount).map(r => (
                      <tr key={r.product_id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium">{r.product_name} <span className="text-xs text-gray-400 font-mono-display">{r.plu}</span></td>
                        <td className="px-3 py-2 text-right font-mono-display">{r.sold_qty} {r.unit}</td>
                        <td className="px-3 py-2 text-right font-mono-display">{money(r.sold_amount)}</td>
                        <td className="px-3 py-2 text-right font-mono-display text-emerald-700">{money(r.gross_profit)}</td>
                        <td className="px-3 py-2 text-right font-mono-display text-red-600">{money(r.total_loss)}</td>
                        <td className={`px-3 py-2 text-right font-mono-display font-semibold ${r.net_profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(r.net_profit)}</td>
                        <td className="px-3 py-2 text-right font-mono-display">{r.rotation_per_day}</td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {r.days_since_last_sale == null ? "—" : r.days_since_last_sale === 0 ? "hoy" : `hace ${r.days_since_last_sale}d`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-display">{r.merma_pct != null ? `${r.merma_pct}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-6">
          {!heatmap ? <div className="text-gray-500">Cargando...</div> : (
            <>
              <div className="card-soft p-5">
                <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Ventas por día de la semana</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={heatmap.by_dow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Bar dataKey="amount" fill="#2C392F" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card-soft p-5">
                <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Ventas por hora del día</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={heatmap.by_hour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="hour" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v) => money(v)} labelFormatter={(v) => `${v}:00 hs`} />
                    <Bar dataKey="amount" fill="#E67E22" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="stock" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card-soft p-5"><div className="label-uppercase">Productos</div><div className="text-2xl font-semibold mt-2">{stock.total_products}</div></div>
            <div className="card-soft p-5"><div className="label-uppercase">Valor stock</div><div className="text-2xl font-semibold mt-2 font-mono-display">{money(stock.total_value)}</div></div>
            <div className="card-soft p-5"><div className="label-uppercase">Stock bajo</div><div className="text-2xl font-semibold mt-2 text-orange-600">{stock.low_stock_count}</div></div>
          </div>

          <div className="card-soft p-5">
            <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "Outfit" }}>Valor por producto</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stock.products.map(p => ({ name: p.name, valor: p.current_stock * p.average_cost }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" fontSize={11} interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="valor" fill="#2C392F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PeriodCompareCard({ label, cur, prev, varPct, money: isMoney }) {
  const fmt = (v) => isMoney ? money(v) : String(v);
  const up = varPct != null && varPct >= 0;
  return (
    <div className="card-soft p-5">
      <div className="label-uppercase">{label}</div>
      <div className="text-2xl font-semibold mt-2 font-mono-display">{fmt(cur)}</div>
      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
        {varPct != null && (
          <>
            {up ? <TrendingUp className="w-3 h-3 text-emerald-600" /> : <TrendingDown className="w-3 h-3 text-red-600" />}
            <span className={up ? "text-emerald-700" : "text-red-600"}>{varPct > 0 ? "+" : ""}{varPct}%</span>
          </>
        )}
        <span>vs período previo ({fmt(prev)})</span>
      </div>
    </div>
  );
}
