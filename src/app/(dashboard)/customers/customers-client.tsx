"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Phone, Mail, ShoppingBag, Search, ChevronDown } from "lucide-react";
import { CustomerDrawer } from "@/components/customers/customer-drawer";

export function CustomersClient({
  initialCustomers,
  total,
  currentSearch,
}: {
  initialCustomers: any[];
  total: number;
  currentSearch?: string;
}) {
  const [customers, setCustomers] = useState<any[]>(initialCustomers);
  const [search, setSearch] = useState(currentSearch || "");
  const [sort, setSort] = useState("orders");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(total > initialCustomers.length);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  const observerTarget = useRef(null);
  const pageSize = 30;

  const fetchCustomers = async (p: number, s: string, sortBy: string, append = false) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/customers?page=${p}&pageSize=${pageSize}&search=${encodeURIComponent(s)}&sort=${sortBy}`);
      const data = await res.json();
      
      if (append) {
        setCustomers((prev) => {
          const newCustomers = (data.customers || []).filter(
            (c: any) => !prev.some((p: any) => p.id === c.id)
          );
          return [...prev, ...newCustomers];
        });
      } else {
        setCustomers(data.customers || []);
      }
      setHasMore(data.hasMore);
    } catch (error) {
      console.error("Failed to fetch customers", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers(1, search, sort, false);
  };

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    setPage(1);
    fetchCustomers(1, search, newSort, false);
  };

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchCustomers(nextPage, search, sort, true);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, page, search, sort]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Customers CRM</h2>
          <p className="text-sm text-zinc-500">{total || 0} total customers</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors">
              Sort by: {sort === "orders" ? "Most Orders" : sort === "spent" ? "Highest Spend" : "Newest"}
              <ChevronDown size={14} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 overflow-hidden">
              <button onClick={() => handleSortChange("orders")} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Most Orders</button>
              <button onClick={() => handleSortChange("spent")} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Highest Spend</button>
              <button onClick={() => handleSortChange("newest")} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Newest First</button>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, phone, or email..."
            className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm
                      text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </form>
        <a
          href={`/api/customers/export?search=${encodeURIComponent(search)}&sort=${sort}`}
          download
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          Export CSV
        </a>
      </div>

      {/* Customers grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {customers.length === 0 && !loading && (
          <div className="col-span-1 sm:col-span-2 text-center py-16 text-zinc-600">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No customers found.</p>
          </div>
        )}
        
        {customers.map((customer: any) => {
          const isVIP = customer.total_spent >= 10000 || customer.total_orders >= 5;

          return (
            <div 
              key={customer.id}
              onClick={() => setSelectedCustomer(customer)}
              className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 cursor-pointer transition-all group"
            >
              {/* Avatar + Name */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30
                                flex items-center justify-center text-sm font-bold text-indigo-400 shrink-0">
                    {customer.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate group-hover:text-indigo-400 transition-colors">
                      {customer.name}
                    </p>
                    {customer.phone && (
                      <p className="text-xs text-indigo-400/80 flex items-center gap-1 mt-0.5">
                        <Phone size={10} /> {customer.phone}
                      </p>
                    )}
                  </div>
                </div>
                
                {isVIP && (
                  <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    VIP
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-zinc-800/50">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Orders</p>
                  <p className="text-sm font-bold text-zinc-200 flex items-center gap-1">
                    <ShoppingBag size={12} className="text-indigo-400" />
                    {customer.total_orders || 0}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Total Spent</p>
                  <p className="text-sm font-bold text-emerald-400">
                    ৳{Number(customer.total_spent || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div ref={observerTarget} className="py-6 text-center text-zinc-500 text-xs">
          {loading ? "Loading more customers..." : "Scroll for more"}
        </div>
      )}

      {selectedCustomer && (
        <CustomerDrawer 
          customer={selectedCustomer} 
          onClose={() => setSelectedCustomer(null)} 
        />
      )}
    </div>
  );
}
