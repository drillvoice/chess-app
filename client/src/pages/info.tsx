import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function Info() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>
            Learn more about this chess training app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-600">
          <p>
            Pawn Star helps you log tactics, games, and study to track your
            progress over time.
          </p>
          <p>
            This project is open source—view the code on{" "}
            <a
              href="https://github.com/drillvoice/chess-app"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              GitHub
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
