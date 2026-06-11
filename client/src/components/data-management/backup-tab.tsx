import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import {
  backupVerificationManager,
  BackupHealth,
  RestorePoint,
} from '@/lib/backup/backup-verification';

function getHealthBadgeVariant(health: number) {
  if (health >= 80) return 'default';
  if (health >= 60) return 'secondary';
  return 'destructive';
}

function getHealthIcon(health: number) {
  if (health >= 80) return CheckCircle;
  if (health >= 60) return AlertTriangle;
  return XCircle;
}

export default function BackupTab() {
  const [backupHealth, setBackupHealth] = useState<BackupHealth | null>(null);
  const [restorePoints, setRestorePoints] = useState<RestorePoint[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { toast } = useToast();

  const handleBackupVerification = async () => {
    try {
      setVerifying(true);
      const health = await backupVerificationManager.calculateBackupHealth();
      const points = await backupVerificationManager.getAvailableRestorePoints();
      setBackupHealth(health);
      setRestorePoints(points);

      toast({
        title: 'Backup Verification Complete',
        description: `Backup health: ${health.overallHealth}%`,
      });
    } catch (_error) {
      toast({
        title: 'Verification Failed',
        description: 'Could not verify backup integrity',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleRestore = async (restorePointId: string) => {
    try {
      setRestoring(true);

      const result = await backupVerificationManager.restoreFromPoint(
        restorePointId,
        {
          includeTrainingSessions: true,
          includeDailyGoals: true,
          includeSettings: false,
          createBackup: true,
        },
        (progress) => {
          toast({
            title: `Restore Progress: ${Math.round(progress.percent)}%`,
            description: progress.phase,
          });
        },
      );

      if (result.success) {
        toast({
          title: 'Restore Complete',
          description: `Restored ${result.restored.sessions} sessions`,
        });
      } else {
        toast({
          title: 'Restore Failed',
          description: result.errors.join(', '),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Restore Failed',
        description: error instanceof Error ? error.message : 'Restore operation failed',
        variant: 'destructive',
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Shield className="h-5 w-5" />
          <span>Backup Verification & Restore</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleBackupVerification} disabled={verifying} className="w-full">
          {verifying ? 'Verifying...' : 'Verify Backup Integrity'}
        </Button>

        {/* Backup Health */}
        {backupHealth && (
          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="flex items-center space-x-2 font-medium">
              {(() => {
                const Icon = getHealthIcon(backupHealth.overallHealth);
                return <Icon className="h-4 w-4" />;
              })()}
              <span>Backup Health</span>
              <Badge variant={getHealthBadgeVariant(backupHealth.overallHealth)}>
                {backupHealth.overallHealth}%
              </Badge>
            </h4>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>Data Integrity: {backupHealth.dataIntegrity}%</div>
              <div>Completeness: {backupHealth.completeness}%</div>
              <div>Consistency: {backupHealth.consistency}%</div>
              <div>Last Backup: {backupHealth.lastBackupAge}h ago</div>
            </div>
          </div>
        )}

        {/* Restore Points */}
        {restorePoints.length > 0 && (
          <div className="space-y-3">
            <Label>Available Restore Points</Label>
            {restorePoints.map((point) => (
              <div key={point.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">{point.description}</span>
                    <Badge variant="outline">
                      {point.source === 'cloud_backup' ? 'Cloud' : 'Local'}
                    </Badge>
                  </div>
                  <Button size="sm" onClick={() => handleRestore(point.id)} disabled={restoring}>
                    {restoring ? 'Restoring...' : 'Restore'}
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
                  <div>Sessions: {point.sessionCount}</div>
                  <div>Settings: {point.hasSettings ? '✓' : '✗'}</div>
                  <div>Goals: {point.hasDailyGoals ? '✓' : '✗'}</div>
                </div>

                <div className="text-xs text-muted-foreground">
                  {point.timestamp.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
