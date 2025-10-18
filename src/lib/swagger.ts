import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Pokefuta API',
      version: '1.0.0',
      description: 'ポケふた写真管理アプリのAPI仕様書',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'supabase-auth-token',
          description: 'Supabase認証Cookie',
        },
      },
      schemas: {
        Manhole: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'マンホールID' },
            title: { type: 'string', description: 'タイトル' },
            prefecture: { type: 'string', description: '都道府県' },
            municipality: { type: 'string', nullable: true, description: '市区町村' },
            location: { type: 'string', description: '位置情報 (PostGIS POINT)' },
            latitude: { type: 'number', format: 'double', description: '緯度' },
            longitude: { type: 'number', format: 'double', description: '経度' },
            pokemons: {
              type: 'array',
              items: { type: 'string' },
              description: '登場ポケモン',
            },
            detail_url: { type: 'string', nullable: true, description: '詳細URL' },
            prefecture_site_url: { type: 'string', nullable: true, description: '都道府県サイトURL' },
            created_at: { type: 'string', format: 'date-time', description: '作成日時' },
            updated_at: { type: 'string', format: 'date-time', description: '更新日時' },
          },
        },
        Visit: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: '訪問記録ID' },
            user_id: { type: 'string', format: 'uuid', description: 'ユーザーID' },
            manhole_id: { type: 'integer', nullable: true, description: 'マンホールID' },
            shot_at: { type: 'string', format: 'date-time', description: '撮影日時' },
            shot_location: { type: 'string', nullable: true, description: '撮影位置 (PostGIS POINT)' },
            note: { type: 'string', nullable: true, description: 'メモ' },
            created_at: { type: 'string', format: 'date-time', description: '作成日時' },
            updated_at: { type: 'string', format: 'date-time', description: '更新日時' },
          },
        },
        Photo: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: '写真ID' },
            visit_id: { type: 'string', format: 'uuid', nullable: true, description: '訪問記録ID' },
            manhole_id: { type: 'integer', nullable: true, description: 'マンホールID' },
            storage_key: { type: 'string', description: 'ストレージキー' },
            original_name: { type: 'string', nullable: true, description: '元ファイル名' },
            file_size: { type: 'integer', nullable: true, description: 'ファイルサイズ (bytes)' },
            content_type: { type: 'string', nullable: true, description: 'Content-Type' },
            width: { type: 'integer', nullable: true, description: '幅 (px)' },
            height: { type: 'integer', nullable: true, description: '高さ (px)' },
            created_at: { type: 'string', format: 'date-time', description: '作成日時' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'エラーメッセージ' },
            details: { type: 'string', nullable: true, description: '詳細エラー' },
          },
        },
      },
    },
    tags: [
      { name: 'manholes', description: 'マンホール情報' },
      { name: 'visits', description: '訪問記録' },
      { name: 'photos', description: '写真管理' },
      { name: 'auth', description: '認証' },
    ],
  },
  apis: ['./src/app/api/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
