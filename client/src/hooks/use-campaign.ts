import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCampaignAttempts } from '@/lib/firebase/campaign';
import { campaignProgress, summarizeAttempts } from '@/lib/campaign/progress';

export const CAMPAIGN_QUERY_KEY = ['campaign-attempts'];

export function useCampaign() {
  const query = useQuery({ queryKey: CAMPAIGN_QUERY_KEY, queryFn: getCampaignAttempts });
  const attempts = useMemo(() => query.data ?? [], [query.data]);
  const progress = useMemo(() => summarizeAttempts(attempts), [attempts]);
  const chapters = useMemo(() => campaignProgress(progress), [progress]);
  return { ...query, attempts, progress, chapters };
}
