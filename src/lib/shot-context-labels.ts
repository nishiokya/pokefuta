import { ShotContextLabel } from '@/types/database';

export const SHOT_CONTEXT_LABELS = new Set<ShotContextLabel>([
  'centered_clean',
  'selfie_with_manhole',
  'wide_context',
  'signage_info',
  'partial_occluded',
  'not_relevant',
  'low_quality',
]);
