import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getUserSettings, updateUserSettings } from "@/lib/firebase-utils";

export default function LichessSettings() {
  const [username, setUsername] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await getUserSettings();
        if (mounted && settings?.lichessUsername) {
          setUsername(settings.lichessUsername);
        }
      } catch (err) {
        console.warn("Failed to load settings", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    try {
      await updateUserSettings({ lichessUsername: username });
      toast({
        title: "Saved",
        description: "Lichess username updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save username",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lichess</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Label htmlFor="lichess-username" className="sr-only">
              Lichess Username
            </Label>
            <Input
              id="lichess-username"
              placeholder="Lichess username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <Button onClick={handleSave} className="shrink-0">
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
