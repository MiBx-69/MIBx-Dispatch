import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Truck, AlertTriangle } from "lucide-react";

export function FinancialsWidget({ pendingCOD, deliveredCOD, returnedCOD }: { pendingCOD: number, deliveredCOD: number, returnedCOD: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-3 w-full">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending COD</CardTitle>
          <Truck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">৳{pendingCOD.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            In Transit / Pending
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Delivered Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">৳{deliveredCOD.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Delivered successfully
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Lost to Returns</CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-500">৳{returnedCOD.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Returned orders COD
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
