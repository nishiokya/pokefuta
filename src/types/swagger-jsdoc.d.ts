declare module 'swagger-jsdoc' {
  export interface SwaggerDefinition {
    openapi?: string;
    info: {
      title: string;
      version: string;
      description?: string;
      license?: {
        name: string;
        url?: string;
      };
      contact?: {
        name?: string;
        email?: string;
        url?: string;
      };
    };
    servers?: Array<{
      url: string;
      description?: string;
    }>;
    components?: {
      securitySchemes?: Record<string, any>;
      schemas?: Record<string, any>;
      responses?: Record<string, any>;
      parameters?: Record<string, any>;
      requestBodies?: Record<string, any>;
    };
    tags?: Array<{
      name: string;
      description?: string;
    }>;
    externalDocs?: {
      description?: string;
      url: string;
    };
  }

  export interface Options {
    definition: SwaggerDefinition;
    apis: string[];
  }

  function swaggerJsdoc(options: Options): any;

  export = swaggerJsdoc;
}
