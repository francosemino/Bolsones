import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { money, fmtDateTime } from "../lib/format";
import StateBadge from "../components/StateBadge";
import {
  TrendingUp, ShoppingBag, Boxes, AlertTriangle, ClipboardList, Wallet, Sprout, BarChart3,
} from "lucide-react";

const MetricCard = ({ icon: Icon, label, value, hint, accent = "primary", testId }) => (
  <div className="card-soft p-5" data-testid={testId}>
    <div className="flex items-start justify-between">
      <div>
        <div className="label-uppercase">{label}</div>
        <div className="text-2xl sm:text-3xl font-semibold mt-2" style={{ fontFamily: "Outfit" }}>{value}</div>
        {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        accent === "accent" ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-700"
      }`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data));
  }, []);

  if (!data) return <div className="text-gray-500">Cargando dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Resumen</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">Estado en vivo de tu negocio · {fmtDateTime(new Date().toISOString())}</p>
        </div>
        {data.cash_session ? (
          <div className="card-soft p-3 flex items-center gap-3">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <div>
              <div className="text-xs text-gray-500">Caja abierta</div>
              <div className="text-sm font-medium">Por {data.cash_session.opened_by_name}</div>
            </div>
            <StateBadge status="abierta" />
          </div>
        ) : (
          <div className="card-soft p-3 flex items-center gap-3">
            <Wallet className="w-5 h-5 text-gray-400" />
            <div className="text-sm text-gray-500">Caja cerrada</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={TrendingUp} label="Ventas del día" value={money(data.sales_today_total)} hint={`${data.sales_today_count} operaciones`} testId="metric-sales-today" />
        <MetricCard icon={BarChart3} label="Ventas del mes" value={money(data.sales_month_total)} testId="metric-sales-month" />
        <MetricCard icon={Sprout} label="Bolsones armados hoy" value={data.bags_today} hint={`${data.bags_available} disponibles`} testId="metric-bags-today" />
        <MetricCard icon={ShoppingBag} label="Bolsones vendidos" value={data.bags_sold_total} testId="metric-bags-sold" />
        <MetricCard icon={AlertTriangle} label="Stock crítico" value={data.low_stock_count} accent="accent" hint="Productos por debajo del mínimo" testId="metric-low-stock" />
        <MetricCard icon={ClipboardList} label="Pedidos pendientes" value={data.pending_orders} testId="metric-pending-orders" />
        <MetricCard icon={Boxes} label="Merma del mes" value={money(data.waste_month_total)} accent="accent" testId="metric-waste-month" />
        <MetricCard icon={TrendingUp} label="Ganancia estimada hoy" value={money(data.estimated_margin_today)} testId="metric-margin-today" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card-soft p-5 lg:col-span-2" data-testid="alerts-panel">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label-uppercase">Alertas</div>
              <h3 className="text-lg font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Atención</h3>
            </div>
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          </div>
          {data.alerts.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center">Todo en orden por aquí ✓</div>
          ) : (
            <ul className="space-y-2">
              {data.alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-md bg-orange-50/50 border border-orange-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2" />
                  <div className="text-sm text-gray-800">{a.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-soft p-5" data-testid="today-deliveries">
          <div className="label-uppercase">Entregas de hoy</div>
          <h3 className="text-lg font-semibold mt-1 mb-3" style={{ fontFamily: "Outfit" }}>Reparto</h3>
          {data.today_deliveries.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">No hay entregas programadas para hoy</div>
          ) : (
            <ul className="space-y-3">
              {data.today_deliveries.slice(0, 5).map((o) => (
                <li key={o.id} className="border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{o.customer_name}</div>
                    <StateBadge status={o.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{o.address || "Retiro"} · {o.time_slot || "Sin franja"}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card-soft p-5" data-testid="low-stock-panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label-uppercase">Stock crítico</div>
            <h3 className="text-lg font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Productos para reponer</h3>
          </div>
        </div>
        {data.low_stock.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center">Sin productos por debajo del mínimo</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2">Producto</th>
                  <th>Categoría</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Mínimo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.low_stock.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="text-gray-600 capitalize">{p.category}</td>
                    <td className="text-right font-mono-display">{p.current_stock} {p.unit}</td>
                    <td className="text-right text-gray-600 font-mono-display">{p.minimum_stock}</td>
                    <td className="text-right"><StateBadge status="stock_bajo" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
