declare module 'fontkit' {
  export interface GlyphPath {
    toSVG(): string;
  }

  export interface Glyph {
    id: number;
    path: GlyphPath;
  }

  export interface GlyphPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }

  export interface GlyphRun {
    glyphs: Glyph[];
    positions: GlyphPosition[];
    advanceWidth: number;
  }

  export interface Font {
    unitsPerEm: number;
    layout(text: string): GlyphRun;
  }

  export interface FontCollection {
    fonts: Font[];
  }

  export function create(buffer: Buffer, postscriptName?: string): Font | FontCollection;
  export function openSync(filename: string, postscriptName?: string): Font | FontCollection;
}
