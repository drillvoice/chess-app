import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Info() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>About Pawn Star</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Pawn Star is a progressive web app for logging chess training sessions. Track tactics, games, and study time while
            keeping your data synced across devices.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About the Developer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Built by a chess enthusiast and software developer who loves blending technology with the game of kings.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Have suggestions or found a bug?{" "}
            <a
              className="text-blue-600 hover:underline"
              href="mailto:pawn.star.chess.logger@gmail.com?subject=Pawn%20Star%20Feedback"
            >
              Send us an email
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

