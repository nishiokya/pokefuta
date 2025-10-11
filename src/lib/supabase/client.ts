import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// 環境変数チェック
// ==========================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase設定エラー:');
  console.error('環境変数が設定されていません。.env.localファイルを確認してください。');
  console.error('必要な環境変数:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('\n現在の値:');
  console.error(`  NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '設定済み' : '未設定'}`);
  console.error(`  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '設定済み' : '未設定'}`);
}

// ==========================================
// フロントエンド用クライアント
// ==========================================
// RLSで保護されるため、ANON_KEYの使用は安全
export const createBrowserClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '⚠️ Supabase設定エラー:\n' +
      '.env.localファイルに以下の環境変数を設定してください:\n' +
      '  - NEXT_PUBLIC_SUPABASE_URL\n' +
      '  - NEXT_PUBLIC_SUPABASE_ANON_KEY\n\n' +
      'SupabaseダッシュボードのSettings > API から取得できます。'
    );
  }

  return createClientComponentClient();
};

// ==========================================
// サーバーサイド用クライアント (Admin)
// ==========================================
// ⚠️ RLSをバイパスするため、API Routeでのみ使用
// ⚠️ 絶対にフロントエンドに露出させない
const createAdminClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('⚠️ Supabase Admin設定エラー: SERVICE_ROLE_KEYが未設定です');
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export const supabaseAdmin = createAdminClient();
