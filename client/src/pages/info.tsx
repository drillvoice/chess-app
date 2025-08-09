import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Info() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            About <em>Pawn Star</em>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Pawn Star is an app to help you get the most out of your chess practice. Playing games and studying tactics is
            essential to improve at chess. And you can get even more out of it when you track your progress and review how you
            are going. This approach is inspired by 
            <a href="https://nextlevelchess.com/free-ebook/" target="_blank">
              <em>The Art of Chess Training</em>
            </a>
            by GM Noël Studer.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About the Developer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            I am OK at chess and OK at making apps! I recently got back into chess after a long hiatus.
            Not only do I love the game, I love the way it's possible to quantify my progress and break down my learning journey. 
            This is my first app and I hope it helps chess students everywhere! If you fancy a game, I am <a href="https://lichess.org/@/softtalk" target="_blank">softtalk on Lichess</a>. 
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            This app is still in development. 
            I've been using it for weeks and it works for me, but I'm sure it could work better! 
            If you have any feedback or comments, 
            <a
              className="text-blue-600 hover:underline"
              href="mailto:pawn.star.chess.logger@gmail.com?subject=Pawn%20Star%20Feedback"
            >
              please email me.
            </a>
            
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

