import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth, canAccess } from "../context/AuthContext";
import { Toaster } from "../components/ui/sonner";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, ScanLine, Sprout,
  ClipboardList, Users, Wallet, DollarSign, Tag, BarChart3, Settings,
  LogOut, Menu, X, Leaf, UserCog, Trash2, Boxes, Scale, Receipt,
  TrendingDown, Repeat, TagIcon,
} from "lucide-react";
import { Button } from "../components/ui/button";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true }, // visible para cualquier usuario logueado
  { section: "Operación" },
  { to: "/app/balance", label: "Balanza (ticket)", icon: Scale, perm: "ventas" },
  { to: "/app/cashier-queue", label: "Cola de Caja", icon: Receipt, perm: "ventas" },
  { to: "/app/pos", label: "POS clásico", icon: ScanLine, perm: "ventas" },
  { to: "/app/cash", label: "Caja", icon: Wallet, perm: "ventas" },
  { to: "/app/bag-builder", label: "Armado de Bolsones", icon: Sprout, perm: "bolsones" },
  { to: "/app/bags", label: "Bolsones", icon: Boxes, perm: "bolsones" },
  { to: "/app/orders", label: "Pedidos", icon: ClipboardList, perm: "pedidos" },
  { section: "Inventario" },
  { to: "/app/stock", label: "Stock", icon: Package, perm: "stock" },
  { to: "/app/price-editor", label: "Precios rápidos", icon: TagIcon, perm: "stock" },
  { to: "/app/reclassify", label: "Reclasificar", icon: Repeat, perm: "perdidas" },
  { to: "/app/purchases", label: "Compras", icon: ShoppingCart, perm: "stock" },
  { to: "/app/suppliers", label: "Proveedores", icon: Truck, perm: "stock" },
  { to: "/app/bag-types", label: "Tipos de Bolsón", icon: Tag, perm: "bolsones" },
  { to: "/app/waste", label: "Mermas / Decomiso", icon: Trash2, perm: "perdidas" },
  { section: "Gestión" },
  { to: "/app/customers", label: "Clientes", icon: Users, perm: "ventas" },
  { to: "/app/employees", label: "Empleados", icon: UserCog, perm: "empleados" },
  { to: "/app/payroll", label: "Sueldos", icon: Wallet, perm: "empleados" },
  { to: "/app/expenses", label: "Gastos", icon: DollarSign, perm: "reportes" },
  { to: "/app/reports", label: "Reportes", icon: BarChart3, perm: "reportes" },
  { to: "/app/ideal-vs-real", label: "Ideal vs Real", icon: TrendingDown, perm: "reportes" },
  { to: "/app/settings", label: "Configuración", icon: Settings, perm: "config" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:flex-col fixed inset-y-0 left-0 w-64 border-r border-gray-200 bg-white z-30">
        <div className="h-16 flex items-center gap-2 px-6 border-b border-gray-200">
          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-base leading-none" style={{ fontFamily: "Outfit" }}>BolsonesControl</div>
            <div className="text-xs text-gray-500 mt-0.5">Gestión integral</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-3 space-y-0.5">
          {NAV.map((item, idx) => {
            if (item.section) {
              return (
                <div key={idx} className="px-3 pt-4 pb-1 label-uppercase">
                  {item.section}
                </div>
              );
            }
            if (!canAccess(user, item.perm)) return null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={`nav-${item.to.replace(/\//g, "-")}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
                    isActive
                      ? "bg-[hsl(var(--primary))] text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-[hsl(var(--accent))] flex items-center justify-center text-white text-xs font-semibold">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-600 hover:text-gray-900"
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 glass-header border-b border-gray-200/60 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[hsl(var(--primary))] flex items-center justify-center">
            <Leaf className="w-4 h-4 text-white" />
          </div>
          <div className="font-semibold" style={{ fontFamily: "Outfit" }}>BolsonesControl</div>
        </div>
        <button
          className="p-2 rounded-md hover:bg-gray-100"
          onClick={() => setOpen((s) => !s)}
          data-testid="mobile-menu-toggle"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 top-14 z-30 bg-white overflow-y-auto">
          <nav className="p-3 space-y-0.5">
            {NAV.map((item, idx) => {
              if (item.section) {
                return <div key={idx} className="px-3 pt-4 pb-1 label-uppercase">{item.section}</div>;
              }
              if (!canAccess(user, item.perm)) return null;
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                      isActive ? "bg-[hsl(var(--primary))] text-white" : "text-gray-700 hover:bg-gray-100"
                    }`
                  }
                >
                  <Icon className="w-4 h-4" /> {item.label}
                </NavLink>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-red-600 w-full"
            >
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className="md:ml-64 pt-14 md:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}
