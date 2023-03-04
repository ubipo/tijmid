import createGeojson2svgConverter from "geojson2svg"
import { html } from "./html.js"
import bbox from "geojson-bbox";
import { extract } from "../util/array.js";


export function createSvgMap(
  countriesGeoJson: any,
  highlightedCountryCode: string,
  mapExtentBuffer = { left: 30, bottom: 15, right: 30, top: 15 },
) {
  const [highlightedCountryOrig, otherCountries] = extract(
    countriesGeoJson.features,
    (f: any) => f.properties.a2 === highlightedCountryCode
  )
  const highlightedCountry = {
    ...highlightedCountryOrig,
    properties: {
      ...highlightedCountryOrig.properties,
      highlighted: 'highlighted',
    }
  }
  const [
    extentLeft, extendBottom, extentRight, extentTop
  ] = bbox(highlightedCountry)

  const geojson = {
    ...countriesGeoJson,
    features: [...otherCountries, highlightedCountry]
  }

  const mapExtent = {
    left: Math.max(-128, extentLeft - mapExtentBuffer.left),
    bottom: Math.max(-90, extendBottom - mapExtentBuffer.bottom),
    right: Math.min(128, extentRight + mapExtentBuffer.right),
    top: Math.min(90, extentTop + mapExtentBuffer.top),
  }
  const mapExtentWidth = Math.min(256, Math.ceil(mapExtent.right - mapExtent.left))
  const mapExtentHeight = Math.min(256, Math.ceil(mapExtent.top - mapExtent.bottom))
  const geoJson2SvgConverter = createGeojson2svgConverter({
    mapExtent: mapExtent,
    viewportSize: { width: mapExtentWidth, height: mapExtentHeight },
    precision: 2,
    attributes: ['properties.highlighted']
  })
  const svgStrings = geoJson2SvgConverter.convert(geojson)

  return html`
    <style>
      .svg-map > path {
        fill: #ccc;
      }
      .svg-map > path[highlighted] {
        fill: #ff0000;
      }
    </style>
    <svg
      class="svg-map"
      viewBox="0 0 ${String(mapExtentWidth)} ${String(mapExtentHeight)}"
    >
      ${svgStrings.join('\n')}
    </svg>
  `
}
