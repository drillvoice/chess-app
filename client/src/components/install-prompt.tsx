import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePWA } from "@/hooks/usePWA";

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { canInstall, installApp } = usePWA();

  useEffect(() => {
    if (canInstall && !dismissed) {
      setShowPrompt(true);
    }
  }, [canInstall, dismissed]);

  const handleInstall = async () => {
    try {
      await installApp();
      setShowPrompt(false);
    } catch (error) {
      console.error('Installation failed:', error);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <Card className="bg-blue-50 border-blue-200 mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Download className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-gray-800">Install App</h3>
              <p className="text-sm text-gray-600">Get the full mobile experience</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              className="text-gray-600"
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              onClick={handleInstall}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Install
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}