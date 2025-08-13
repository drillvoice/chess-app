import { Suspense } from "react";
import { DataManagement } from "@/components/lazy-components";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import LichessSettings from "@/components/lichess-settings";

export default function Account() {
  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Manage your account settings and data.
          </p>
        </CardContent>
      </Card>
      <LichessSettings />
      <Suspense fallback={<div>Loading account data...</div>}>
        <DataManagement />
      </Suspense>
    </div>
  );
}
