"use client";

import { useEffect, useState } from "react";
import Barcode from "react-barcode";

interface PrintClientProps {
  orders: any[];
  shopDomain?: string | null;
}

export function PrintClient({ orders, shopDomain }: PrintClientProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Automatically trigger print dialog after a short delay to allow barcodes to render
    const timer = setTimeout(() => {
      window.print();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  const merchantName = shopDomain?.replace(".myshopify.com", "")?.toUpperCase() || "MERCHANT";

  return (
    <div className="bg-zinc-200 min-h-screen text-black print:bg-white flex flex-col items-center py-8 print:py-0">
      
      <div className="print:hidden mb-4 flex gap-4">
        <button 
          onClick={() => window.print()}
          className="px-6 py-2 bg-indigo-600 text-white font-bold rounded shadow hover:bg-indigo-700"
        >
          Print Labels
        </button>
        <button 
          onClick={() => window.close()}
          className="px-6 py-2 bg-zinc-300 text-zinc-800 font-bold rounded shadow hover:bg-zinc-400"
        >
          Close Tab
        </button>
      </div>

      <div className="w-full max-w-[4in] print:max-w-none print:w-[4in]">
        {orders.map((order, index) => {
          const dispatch = order.dispatches && order.dispatches.length > 0 ? order.dispatches[0] : null;
          const consignmentId = dispatch?.consignment_id || "PENDING";
          const amountToCollect = dispatch?.amount_to_collect ?? order.total_price;
          
          const addr = order.shipping_address || {};
          const addressString = [
            addr.address1,
            addr.address2,
            addr.city,
            addr.province,
            addr.zip
          ].filter(Boolean).join(", ");

          return (
            <div 
              key={order.id} 
              className="bg-white p-4 mb-8 print:mb-0 border border-zinc-400 print:border-none shadow-lg print:shadow-none w-full box-border relative"
              style={{
                width: '4in',
                minHeight: '6in',
                pageBreakAfter: index < orders.length - 1 ? 'always' : 'auto',
                breakAfter: index < orders.length - 1 ? 'page' : 'auto'
              }}
            >
              {/* Header */}
              <div className="border-b-2 border-black pb-2 mb-4 text-center">
                <h1 className="text-2xl font-black uppercase tracking-wider">{merchantName}</h1>
                <p className="text-xs font-semibold uppercase mt-1">Order {order.shopify_order_name}</p>
              </div>

              {/* Barcode Area */}
              <div className="flex justify-center mb-6 overflow-hidden">
                {consignmentId !== "PENDING" ? (
                  <Barcode 
                    value={consignmentId} 
                    width={1.8} 
                    height={60} 
                    fontSize={14}
                    margin={0}
                    displayValue={true}
                  />
                ) : (
                  <div className="h-[60px] flex items-center justify-center border-2 border-dashed border-zinc-400 w-full text-zinc-500 font-bold uppercase">
                    NO CONSIGNMENT ID
                  </div>
                )}
              </div>

              {/* Recipient Details */}
              <div className="border-2 border-black p-3 mb-4 rounded">
                <div className="text-xs font-bold uppercase text-zinc-600 mb-1">Deliver To:</div>
                <div className="font-bold text-lg leading-tight mb-1">{order.customer_name}</div>
                <div className="text-base font-semibold mb-2">{order.customer_phone}</div>
                <div className="text-sm leading-snug">{addressString}</div>
              </div>

              {/* Payment Details */}
              <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-4">
                <div className="text-sm font-bold uppercase">Cash on Delivery</div>
                <div className="text-2xl font-black">{order.currency} {amountToCollect}</div>
              </div>

              {/* Items List */}
              <div>
                <div className="text-xs font-bold uppercase text-zinc-600 mb-2 border-b border-zinc-300 pb-1">Items Included:</div>
                <ul className="text-sm space-y-1">
                  {(order.line_items || []).map((item: any, i: number) => (
                    <li key={i} className="flex justify-between font-medium">
                      <span className="truncate pr-2">{item.quantity}x {item.title}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Footer */}
              <div className="absolute bottom-4 left-4 right-4 text-center border-t border-black pt-2 text-xs font-semibold text-zinc-500">
                Printed via MiBx Dispatch
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
