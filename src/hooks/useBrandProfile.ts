import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBrandProfile, upsertBrandProfile } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { BrandProfile } from '../types/database';

export function useBrandProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brand-profile', user?.id],
    queryFn: () => getBrandProfile(user!.id),
    enabled: !!user,
  });
}

export function useUpsertBrandProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (profile: Partial<BrandProfile>) =>
      upsertBrandProfile({ ...profile, user_id: user!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-profile', user?.id] });
    },
  });
}
