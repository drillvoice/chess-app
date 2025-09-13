import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Cloud, Shield } from 'lucide-react';
import { useLocation } from 'wouter';

export default function CloudBackupReminder() {
  const [isVisible, setIsVisible] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Check if reminder should be shown
    const checkVisibility = () => {
      const dismissed = localStorage.getItem('cloud-backup-reminder-dismissed');
      const reminderFirstShown = localStorage.getItem('cloud-backup-reminder-first-shown');
      
      // If already dismissed, don't show
      if (dismissed === 'true') {
        return false;
      }

      // Check if user already has cloud backup enabled
      // We can check for existing Firebase auth state or sync activity
      const hasCloudSync = localStorage.getItem('firebase-user') || localStorage.getItem('cloud-sync-active');
      if (hasCloudSync) {
        return false;
      }

      // If first time, set the timestamp
      if (!reminderFirstShown) {
        localStorage.setItem('cloud-backup-reminder-first-shown', Date.now().toString());
        return true;
      }

      // Show for up to 7 days after first shown
      const daysSinceFirst = (Date.now() - parseInt(reminderFirstShown)) / (1000 * 60 * 60 * 24);
      return daysSinceFirst <= 7;
    };

    setIsVisible(checkVisibility());
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('cloud-backup-reminder-dismissed', 'true');
    setIsVisible(false);
  };

  const handleGoToBackup = () => {
    setLocation('/account');
    handleDismiss();
  };

  if (!isVisible) return null;

  return (
    <Card className="border-green-200 bg-green-50">
      <CardContent className="relative p-4">
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-2 top-2 h-6 w-6 p-0"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
        
        <div className="flex items-start space-x-3 pr-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <Shield className="h-4 w-4 text-green-600" />
          </div>
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center space-x-2">
              <Cloud className="h-4 w-4 text-green-600" />
              <h3 className="font-medium text-green-800">Protect Your Training Data</h3>
            </div>
            
            <p className="text-sm text-green-700">
              Enable cloud backup to keep your training sessions safe. Weekly automatic backups ensure you never lose your progress.
            </p>
            
            <div className="flex space-x-2">
              <Button
                size="sm"
                onClick={handleGoToBackup}
                className="bg-green-600 hover:bg-green-700"
              >
                Enable Backup
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismiss}
                className="border-green-300 text-green-700 hover:bg-green-100"
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}