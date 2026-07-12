type AuthUserLike = {
  user_metadata?: Record<string, unknown> | null;
};

const readMetadataString = (metadata: Record<string, unknown> | null | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
};

export function getAuthUserDisplayName(user: AuthUserLike): string | undefined {
  const metadata = user.user_metadata;
  // Keep this precedence in sync with database/migrations/024_backfill_app_user_display_names.sql.
  const displayName =
    readMetadataString(metadata, 'display_name') ||
    readMetadataString(metadata, 'name') ||
    readMetadataString(metadata, 'full_name');

  return displayName || undefined;
}
