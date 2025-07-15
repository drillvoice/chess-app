import { useState, useEffect } from "react";
import { User, signInAnonymously, signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cloud, CloudOff, User as UserIcon, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function FirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      await signInAnonymously(auth);
      toast({
        title: "Connected",
        description: "Cloud sync enabled successfully!",
      });
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Could not enable cloud sync. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut(auth);
      toast({
        title: "Disconnected",
        description: "Cloud sync has been disabled.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not disconnect from cloud sync.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <Cloud className="w-5 h-5 text-blue-600 animate-pulse" />
            <div>
              <p className="text-sm text-gray-600">Initializing cloud sync...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={user ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center space-x-2 text-sm">
          {user ? (
            <>
              <Cloud className="w-4 h-4 text-green-600" />
              <span>Cloud Sync Active</span>
            </>
          ) : (
            <>
              <CloudOff className="w-4 h-4 text-gray-600" />
              <span>Cloud Sync Disabled</span>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <UserIcon className="w-4 h-4" />
              <span>Anonymous User</span>
            </div>
            <p className="text-xs text-gray-500">
              Your training data is automatically synced across all your devices.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={loading}
              className="w-full"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Disable Cloud Sync
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Enable cloud sync to access your training data from any device.
            </p>
            <Button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Cloud className="w-4 h-4 mr-2" />
              Enable Cloud Sync
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}