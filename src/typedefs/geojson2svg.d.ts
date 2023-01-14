declare module "geojson2svg" {
  declare class GeoJson2SvgConverter {
    convert(geojson: any): string[];
  }

  export default function createGeojson2svgConverter(options: {
    viewportSize?: {
      width: number
      height: number
    }
    mapExtent?: {
      left: number
      right: number
      bottom: number
      top: number
    }
    output?: 'svg' | 'path'
    fitTo?: 'width' | 'height'
    precision?: number | false
    explode?: boolean
    attributes?: any
    pointAsCircle?: boolean
    r?: number
    callback?: (svgString: string) => void
  }): GeoJson2SvgConverter
}
  