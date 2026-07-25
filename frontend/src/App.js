import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import "./App.css";

import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Stock from "./pages/Stock";
import Suppliers from "./pages/Suppliers";
import Purchases from "./pages/Purchases";
import BagTypes from "./pages/BagTypes";
import BagBuilder from "./pages/BagBuilder";
import Bags from "./pages/Bags";
import LabelPrint from "./pages/LabelPrint";
import POS from "./pages/POS";
import Cash from "./pages/Cash";
import Orders from "./pages/Orders";
import Customers from "./pages/Customers";
import Waste from "./pages/Waste";
import Employees from "./pages/Employees";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import PublicOrder from "./pages/PublicOrder";
import BalanceStation from "./pages/BalanceStation";
import CashierQueue from "./pages/CashierQueue";
import PriceEditor from "./pages/PriceEditor";
import Reclassify from "./pages/Reclassify";
import IdealVsReal from "./pages/IdealVsReal";
import Fichaje from "./pages/Fichaje";
import Payroll from "./pages/Payroll";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Cargando...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pedido" element={<PublicOrder />} />
          <Route path="/fichaje" element={<Fichaje />} />
          <Route path="/label/:bagId" element={<LabelPrint />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="stock" element={<Stock />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="bag-types" element={<BagTypes />} />
            <Route path="bag-builder" element={<BagBuilder />} />
            <Route path="bags" element={<Bags />} />
            <Route path="pos" element={<POS />} />
            <Route path="cash" element={<Cash />} />
            <Route path="balance" element={<BalanceStation />} />
            <Route path="cashier-queue" element={<CashierQueue />} />
            <Route path="price-editor" element={<PriceEditor />} />
            <Route path="reclassify" element={<Reclassify />} />
            <Route path="ideal-vs-real" element={<IdealVsReal />} />
            <Route path="orders" element={<Orders />} />
            <Route path="customers" element={<Customers />} />
            <Route path="waste" element={<Waste />} />
            <Route path="employees" element={<Employees />} />
            <Route path="payroll" element={<Payroll />} />
            <Route path="fichaje" element={<Fichaje />} />
            <Route path="payroll" element={<Payroll />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
