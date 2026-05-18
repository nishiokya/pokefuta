import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

const baseUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://pokefuta.com'
).replace(/\/$/, '');

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  // Public pages suitable for search indexing.
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/map`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/manholes`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/nearby`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/popular`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/api-docs`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  let dynamicPages: MetadataRoute.Sitemap = [];

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('dummy')) {
      const supabase = createClient<Database>(supabaseUrl, supabaseKey);

      const { data: manholes, error } = await supabase
        .from('manhole')
        .select('id, created_at')
        .order('id', { ascending: true });

      if (error) {
        throw error;
      }

      if (manholes && manholes.length > 0) {
        dynamicPages = manholes.map((manhole: { id: number; created_at: string }) => ({
          url: `${baseUrl}/manhole/${manhole.id}`,
          lastModified: new Date(manhole.created_at),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }));
      }
    }
  } catch (error) {
    console.error('Error fetching manholes for sitemap:', error);
  }

  return [...staticPages, ...dynamicPages];
}
