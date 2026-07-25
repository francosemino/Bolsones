import React from "react";

const VARIANTS = {
  disponible: "state-disponible",
  reservado: "state-reservado",
  vendido: "state-vendido",
  pendiente: "state-pendiente",
  confirmado: "state-reservado",
  preparacion: "state-pendiente",
  listo: "state-disponible",
  reparto: "state-reservado",
  entregado: "state-vendido",
  cancelado: "state-cancelado",
  descartado: "state-cancelado",
  vencido: "state-cancelado",
  stock_bajo: "state-stock-bajo",
  pagado: "state-pagado",
  pendiente_pago: "state-pendiente-pago",
  parcial: "state-pendiente-pago",
  abierta: "state-disponible",
  cerrada: "state-vendido",
};

const LABELS = {
  preparacion: "En preparación",
  reparto: "En reparto",
  stock_bajo: "Stock bajo",
  pendiente_pago: "Pago pendiente",
};

export default function StateBadge({ status, className = "" }) {
  if (!status) return null;
  const cls = VARIANTS[status] || "state-vendido";
  const label = LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`state-badge ${cls} ${className}`} data-testid={`badge-${status}`}>
      {label}
    </span>
  );
}
