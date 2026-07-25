import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { money, fmtDate, kg } from "../lib/format";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { Button } from "../components/ui/button";
import { Printer, Leaf } from "lucide-react";

export default function LabelPrint() {
  const { bagId } = useParams();
  const [bag, setBag] = useState(null);
  const [config, setConfig] = useState({ business_name: "BolsonesControl" });
  const qrRef = useRef(null);
  const barcodeRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/bags/${bagId}`);
        setBag(data);
        try {
          const cfg = await api.get("/config");
          setConfig(cfg.data);
        } catch {}
      } catch {
        setBag(false);
      }
    })();
  }, [bagId]);

  useEffect(() => {
    if (!bag) return;
    if (qrRef.current) {
      QRCode.toCanvas(qrRef.current, bag.code, { width: 140, margin: 1 }, () => {});
    }
    if (barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, bag.code, { format: "CODE128", width: 1.6, height: 50, fontSize: 14, margin: 0 });
      } catch {}
    }
  }, [bag]);

  if (bag === false) return <div className="p-6 text-red-600">Bolsón no encontrado</div>;
  if (!bag) return <div className="p-6 text-gray-500">Cargando...</div>;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4 no-print">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "Outfit" }}>Etiqueta de bolsón</h2>
          <Button onClick={() => window.print()} className="bg-[hsl(var(--primary))]" data-testid="print-button">
            <Printer className="w-4 h-4 mr-1.5" /> Imprimir
          </Button>
        </div>

        <div id="print-label" className="bg-white rounded-lg shadow-md p-6 border border-gray-200" style={{ width: "100%" }}>
          <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[hsl(var(--primary))] flex items-center justify-center">
                <Leaf className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-base leading-none" style={{ fontFamily: "Outfit" }}>{config.business_name}</div>
                {config.address && <div className="text-[10px] text-gray-500 mt-0.5">{config.address}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Código</div>
              <div className="font-mono-display text-sm font-semibold">{bag.code}</div>
            </div>
          </div>

          <div className="text-center my-3">
            <div className="text-xs uppercase tracking-widest text-gray-500">{bag.bag_type_name}</div>
            <div className="text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>{money(bag.final_price)}</div>
            <div className="text-sm text-gray-600 mt-1 font-mono-display">{kg(bag.weight_kg)}</div>
          </div>

          <div className="flex items-center justify-around my-4 py-3 border-y border-dashed border-gray-300">
            <canvas ref={qrRef} />
            <div className="text-center">
              <svg ref={barcodeRef} />
            </div>
          </div>

          {bag.ingredients_used && bag.ingredients_used.length > 0 && (
            <div className="text-[10px] text-gray-600 mb-2">
              <div className="font-semibold mb-0.5">Ingredientes:</div>
              {bag.ingredients_used.map((i, idx) => (
                <span key={idx}>{i.product_name}{idx < bag.ingredients_used.length - 1 ? " · " : ""}</span>
              ))}
            </div>
          )}

          <div className="flex justify-between text-[10px] text-gray-500 mt-2">
            <div>Armado: {fmtDate(bag.created_at)}</div>
            {config.whatsapp && <div>{config.whatsapp}</div>}
          </div>
          {config.label_text && <div className="text-[10px] text-gray-500 mt-2 text-center italic">{config.label_text}</div>}
        </div>
      </div>
    </div>
  );
}
