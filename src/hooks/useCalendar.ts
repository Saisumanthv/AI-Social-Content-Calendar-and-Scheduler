import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCalendarPosts,
  updatePost,
  updatePostStatus,
  deleteCalendarPost,
  deleteCalendarForBrand,
  getPlatformConnections,
  generateContentCalendar,
  triggerWebhook,
} from '../lib/api';
import type { ContentCalendarPost, GenerateContentPayload } from '../types/database';

export function useCalendarPosts(brandId: string | undefined) {
  return useQuery({
    queryKey: ['calendar', brandId],
    queryFn: () => getCalendarPosts(brandId!),
    enabled: !!brandId,
  });
}

export function useUpdatePost(brandId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, updates }: { postId: string; updates: Partial<ContentCalendarPost> }) =>
      updatePost(postId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', brandId] });
    },
  });
}

export function useUpdatePostStatus(brandId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, status }: { postId: string; status: ContentCalendarPost['status'] }) =>
      updatePostStatus(postId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', brandId] });
    },
  });
}

export function useDeletePost(brandId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => deleteCalendarPost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', brandId] });
    },
  });
}

export function useGenerateContent(brandId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GenerateContentPayload) => generateContentCalendar(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', brandId] });
    },
  });
}

export function useTriggerWebhook(brandId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', brandId] });
    },
  });
}

export function useClearCalendar(brandId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteCalendarForBrand(brandId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', brandId] });
    },
  });
}

export function usePlatformConnections(brandId: string | undefined) {
  return useQuery({
    queryKey: ['connections', brandId],
    queryFn: () => getPlatformConnections(brandId!),
    enabled: !!brandId,
  });
}
