import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Info() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Learn more about this chess training app.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
